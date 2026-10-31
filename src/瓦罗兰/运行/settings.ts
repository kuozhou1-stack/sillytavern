import { requestBrowserLock, type BrowserLock } from './browser-lock';
import { browserPreferenceScope, readSharedPreference, saveSharedPreference } from './shared-preferences';

export const ApiSettingsSchema = z.object({
  mode: z.enum(['main', 'extra']).prefault('extra'),
  apiurl: z.string().trim().prefault(''),
  key: z.string().prefault(''),
  model: z.string().trim().prefault(''),
  source: z.enum(['openai_compatible', 'google']).prefault('openai_compatible'),
  sendPreset: z.boolean().prefault(false),
  retries: z.number().int().nonnegative().prefault(0),
});
export type ApiSettings = z.infer<typeof ApiSettingsSchema>;
export const InformationApiSettingsSchema = ApiSettingsSchema.extend({ reuseVariable: z.boolean().prefault(true) });
export type ApiChannel = 'variable' | 'phone' | 'information';
export type SettingsChannel = ApiChannel | 'atmosphere';
export type SettingsScope = SettingsChannel | 'general';
const apiChannels = ['variable', 'phone', 'information'] as const;
const apiLabels = { variable: '正文变量 API', phone: '手机与奇遇 API', information: '资料选择 API' };
const preferenceLabels = { ...apiLabels, atmosphere: '氛围设计' };
export const AtmosphereSchema = z.string().prefault('');
export const apiBrowserKey = (channel: ApiChannel, account: string) =>
  `valoran-v1:${encodeURIComponent(account)}:api:${channel}:v1`;
export const atmosphereBrowserKey = (account: string) => `valoran-v1:${encodeURIComponent(account)}:atmosphere:v1`;
const preferenceBrowserKey = (channel: SettingsChannel, account: string) =>
  channel === 'atmosphere' ? atmosphereBrowserKey(account) : apiBrowserKey(channel, account);
const sharedPreferenceKey = (channel: SettingsChannel) => channel === 'atmosphere' ? channel : `api-${channel}` as const;
export const apiConnection = (api: ApiSettings): CustomApiConfig | undefined => api.mode === 'main' ? undefined : ({
  apiurl: api.apiurl,
  key: api.key,
  model: api.model,
  source: api.source === 'google' ? 'makersuite' : 'openai',
});
export const isApiConfigured = (api: ApiSettings) => api.mode === 'main' || (!!api.apiurl && !!api.model);

export function validateApi(api: ApiSettings, name: string, required = true) {
  if (api.mode === 'main') return;
  if (!required && !api.apiurl && !api.model && !api.key) return;
  if (!api.apiurl || !api.model) throw Error(`请填写${name} API 的端点与模型`);
  let url: URL;
  try {
    url = new URL(api.apiurl);
  } catch {
    throw Error(`${name} API 地址无效`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error(`${name} API 地址无效，密钥请填在密钥栏`);
}

export const CharacterRosterSettingsSchema = z.object({
  majorLimit: z.number().int().nonnegative().prefault(6),
  minorLimit: z.number().int().nonnegative().prefault(3),
  majorRotation: z.number().int().nonnegative().prefault(2),
  minorRotation: z.number().int().nonnegative().prefault(1),
}).superRefine((value, ctx) => {
  if (value.majorRotation > value.majorLimit)
    ctx.addIssue({ code: 'custom', path: ['majorRotation'], message: '主要角色的每轮轮换人数不能超过开启上限' });
  if (value.minorRotation > value.minorLimit)
    ctx.addIssue({ code: 'custom', path: ['minorRotation'], message: '次要角色的每轮轮换人数不能超过开启上限' });
});
export type CharacterRosterSettings = z.infer<typeof CharacterRosterSettingsSchema>;

export const SettingsSchema = z
  .object({
    theme: z.string().prefault('warm'),
    font: z.string().prefault('sans'),
    fontSize: z.number().prefault(16),
    lineHeight: z.number().min(1.2).max(2.6).prefault(1.8),
    letterSpacing: z.number().min(-0.05).max(0.2).prefault(0.02),
    paragraphSpacing: z.number().min(0).max(2).prefault(0.8),
    scale: z.number().prefault(100),
    atmosphere: AtmosphereSchema,
    informationAuto: z.boolean().prefault(true),
    characterAuto: z.boolean().prefault(true),
    characterRoster: CharacterRosterSettingsSchema.prefault({}),
    variable: ApiSettingsSchema.prefault({}),
    phone: ApiSettingsSchema.prefault({}),
    information: InformationApiSettingsSchema.prefault({}),
  })
  .prefault({});

const GeneralSettingsSchema = SettingsSchema.unwrap().omit({ variable: true, phone: true, information: true, atmosphere: true }).partial();

export const variableRuleNames = ['[mvu_update]变量更新规则', '[mvu_update]变量输出格式'];
export const normalizeRuleName = (name: string) => name.replace(/\s+/g, '');
export type Settings = z.infer<typeof SettingsSchema>;
const ruleBackupKey = '澄湾额外API规则原状态';
type RuleBackup = { uid: number; name: string; enabled: boolean };

function hasExtraApi(value: Settings) {
  return [value.variable, value.phone].some(isApiConfigured);
}

async function syncExtraApiRules(value: Settings, lock: BrowserLock, assertActive: () => void) {
  const chat = SillyTavern.getCurrentChatId();
  const book = getCharWorldbookNames('current').primary;
  const active = hasExtraApi(value);
  if (!book) {
    if (active) throw Error('角色卡未绑定世界书，无法启用额外 API');
    return;
  }
  const check = () => {
    assertActive();
    lock.assertHeld();
    if (chat !== SillyTavern.getCurrentChatId() || book !== getCharWorldbookNames('current').primary)
      throw Error('聊天或世界书已切换，规则开关操作失效');
  };
  const variables = getVariables({ type: 'character' });
  const backups = (variables[ruleBackupKey] ?? {}) as Record<string, RuleBackup[]>;
  const backup = backups[book];
  if (!active && !backup) return;
  const entries = await getWorldbook(book);
  check();
  const rules = variableRuleNames.map(name => entries.filter(entry => normalizeRuleName(entry.name) === name));
  if (active && rules.some(found => found.length !== 1 || !found[0].content.trim()))
    throw Error('额外 API 所需世界书规则缺失、重复或为空');
  if (active && !backup) {
    const original = rules.map(([entry]) => ({ uid: entry.uid, name: normalizeRuleName(entry.name), enabled: entry.enabled }));
    await replaceVariables({ ...variables, [ruleBackupKey]: { ...backups, [book]: original } }, { type: 'character' });
    check();
  }
  const targets = active
    ? rules.map(([entry]) => ({ uid: entry.uid, name: normalizeRuleName(entry.name), enabled: false }))
    : backup;
  if (targets.some(target => entries.some(entry =>
    entry.uid === target.uid && normalizeRuleName(entry.name) === target.name && entry.enabled !== target.enabled
  ))) {
    await updateWorldbookWith(book, current => {
      check();
      return current.map(entry => {
        const target = targets.find(rule => rule.uid === entry.uid && rule.name === normalizeRuleName(entry.name));
        return target ? { ...entry, enabled: target.enabled } : entry;
      });
    }, { render: 'immediate' });
    check();
    const updated = await getWorldbook(book);
    check();
    for (const target of targets) {
      const actual = updated.find(entry => entry.uid === target.uid && normalizeRuleName(entry.name) === target.name);
      if (!actual || actual.enabled !== target.enabled) throw Error('额外 API 世界书规则开关读回不一致：' + target.name);
    }
  }
  if (!active && backup) {
    const latest = getVariables({ type: 'character' });
    const remaining = { ...(latest[ruleBackupKey] ?? {}) };
    delete remaining[book];
    await replaceVariables({ ...latest, [ruleBackupKey]: remaining }, { type: 'character' });
    check();
  }
}

export function validateSettings(input: unknown): Settings {
  const value = SettingsSchema.parse(input);
  for (const [name, api] of [
    ['变量', value.variable],
    ['手机与奇遇', value.phone],
  ] as const) validateApi(api, name, false);
  if (!value.information.reuseVariable) validateApi(value.information, '资料选择', false);
  return value;
}

export function informationApi(value: Settings): ApiSettings {
  return value.information.reuseVariable
    ? { ...value.variable, sendPreset: value.information.sendPreset }
    : value.information;
}

export function createSettingsController(assertActive: () => void = () => {}) {
  const warnings = new Map<SettingsChannel, string>();
  return {
    async load(channel?: SettingsChannel, base?: Settings) {
      const value = SettingsSchema.parse(base ?? getVariables({ type: 'character' }).澄湾设置);
      let account: string | undefined, scopeWarning = '';
      try { account = await browserPreferenceScope(); }
      catch (error) { scopeWarning = '浏览器账号隔离信息读取失败，保留酒馆或旧角色卡配置：' + String(error); }
      await Promise.all((channel ? [channel] : [...apiChannels, 'atmosphere'] as const).map(async current => {
        const label = preferenceLabels[current], messages: string[] = [];
        const schema = current === 'atmosphere' ? AtmosphereSchema
          : current === 'information' ? InformationApiSettingsSchema : ApiSettingsSchema;
        const assign = (input: unknown) => {
          if (current === 'atmosphere') value.atmosphere = AtmosphereSchema.parse(input);
          else if (current === 'information') value.information = InformationApiSettingsSchema.parse(input);
          else value[current] = ApiSettingsSchema.parse(input);
        };
        let browser: unknown = null;
        if (account) try {
          const raw = window.parent.localStorage.getItem(preferenceBrowserKey(current, account));
          if (raw) { browser = schema.parse(JSON.parse(raw)); assign(browser); }
        } catch (error) { messages.push(`${label}浏览器副本读取失败：${String(error)}`); }
        try {
          const shared = await readSharedPreference(sharedPreferenceKey(current));
          if (shared !== null) {
            assign(shared);
            if (account) try {
              window.parent.localStorage.setItem(preferenceBrowserKey(current, account), JSON.stringify(value[current]));
            } catch (error) { messages.push(`${label}已从酒馆读取，浏览器副本保存失败：${String(error)}`); }
          }
        } catch (error) {
          messages.push(`${label}共用配置读取失败，已使用${browser !== null ? '浏览器副本' : '角色卡配置'}：${String(error)}`);
        }
        warnings.set(current, messages.join('\n'));
      }));
      return { value, warning: [scopeWarning, ...warnings.values()].filter(Boolean).join('\n') };
    },
    async syncRules(value: Settings) {
      const chat = SillyTavern.getCurrentChatId();
      const book = getCharWorldbookNames('current').primary;
      return requestBrowserLock('澄湾设置:' + chat, {}, lock => {
        assertActive();
        lock!.assertHeld();
        if (chat !== SillyTavern.getCurrentChatId() || book !== getCharWorldbookNames('current').primary)
          throw Error('聊天或世界书已切换，规则开关操作失效');
        return syncExtraApiRules(value, lock!, assertActive);
      });
    },
    async recoverLegacyRules() {
      const book = getCharWorldbookNames('current').primary;
      if (!book) return;
      const backup = getVariables({ type: 'character' }).澄湾世界书开关?.[book];
      if (!Array.isArray(backup)) return;
      const chat = SillyTavern.getCurrentChatId();
      return requestBrowserLock('澄湾设置:' + chat, {}, async lock => {
      const check = () => {
        assertActive();
        lock!.assertHeld();
        if (chat !== SillyTavern.getCurrentChatId() || book !== getCharWorldbookNames('current').primary)
          throw Error('聊天或世界书已切换，旧规则恢复失效');
      };
      check();
      await updateWorldbookWith(book, entries => {
        check();
        return entries.map(entry => {
          const old = backup.find((rule: any) => rule.uid === entry.uid && rule.name === normalizeRuleName(entry.name));
          return old ? { ...entry, enabled: old.enabled } : entry;
        });
      }, { render: 'immediate' });
      check();
      const restored = await getWorldbook(book);
      check();
      for (const old of backup) {
        const actual = restored.find(entry => entry.uid === old.uid && normalizeRuleName(entry.name) === old.name);
        if (!actual || actual.enabled !== old.enabled) throw Error('旧世界书规则恢复读回不一致：' + old.name);
      }
      const variables = getVariables({ type: 'character' });
      const remaining = { ...(variables.澄湾世界书开关 ?? {}) };
      delete remaining[book];
      await replaceVariables({ ...variables, 澄湾世界书开关: remaining }, { type: 'character' });
      check();
      });
    },
    async save(input: unknown, channel?: SettingsScope) {
      let value: Partial<Settings>;
      if (channel === 'general') {
        const parsed = GeneralSettingsSchema.parse(input);
        // Zod's partial still materializes inner prefaults. Only save submitted keys.
        value = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(input as object, key)));
      }
      else if (channel === 'atmosphere') value = { atmosphere: AtmosphereSchema.parse((input as Record<string, unknown>)?.atmosphere) };
      else if (channel) {
        const schema = channel === 'information' ? InformationApiSettingsSchema : ApiSettingsSchema;
        const api = schema.parse((input as Record<string, unknown>)?.[channel]);
        if (channel !== 'information' || !(api as Settings['information']).reuseVariable)
          validateApi(api, apiLabels[channel], false);
        value = { [channel]: api };
      } else value = validateSettings(input); // Existing full-settings callers retain their contract.
      const chat = SillyTavern.getCurrentChatId();
      const book = getCharWorldbookNames('current').primary;
      const check = () => {
        assertActive();
        if (chat !== SillyTavern.getCurrentChatId() || book !== getCharWorldbookNames('current').primary)
          throw Error('聊天或世界书已切换，本次设置操作失效');
      };
      return requestBrowserLock('澄湾设置:' + chat, {}, async lock => {
        lock!.assertHeld();
        check();
        if (channel && channel !== 'general') {
          // Confirm the authoritative write before replacing its browser copy.
          const account = await browserPreferenceScope();
          lock!.assertHeld();
          check();
          await saveSharedPreference(sharedPreferenceKey(channel), value[channel]);
          lock!.assertHeld();
          check();
          let warning = '';
          try {
            const key = preferenceBrowserKey(channel, account);
            window.parent.localStorage.setItem(key, JSON.stringify(value[channel]));
            if (!_.isEqual(JSON.parse(window.parent.localStorage.getItem(key) ?? 'null'), value[channel]))
              throw Error('浏览器副本读回不一致');
          } catch (error) { warning = '酒馆共用配置已保存，浏览器副本保存失败：' + String(error); }
          warnings.set(channel, warning);
          return { value, warning };
        }
        if (!channel) await syncExtraApiRules(value as Settings, lock!, assertActive);
        lock!.assertHeld();
        check();
        const variables = getVariables({ type: 'character' });
        const stored = channel === 'general' ? { ...variables.澄湾设置, ...value } : value;
        await replaceVariables(
          { ...variables, 澄湾设置: stored },
          { type: 'character' },
        );
        lock!.assertHeld();
        check();
        if (!_.isEqual(getVariables({ type: 'character' }).澄湾设置, stored))
          throw Error('角色设置读回不一致');
        return { value, warning: '' };
      });
    },
  };
}
