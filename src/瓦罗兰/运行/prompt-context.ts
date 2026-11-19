import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

import type { State } from './core';
import { modelState } from './character-activity';
import { createSourceContextProjector } from './source-context';
import { workerTask } from './worker-task';

export type PromptPurpose = 'story' | 'inline' | 'variables' | 'knowledge' | 'novel';
type PromptContext = { purpose: PromptPurpose; state: State; projection?: Record<string, any> };
export type PromptRequestContext = { expandPrompt: (text: string) => string; updateWorldInfo: boolean };
const contextMacro = /\{\{valoran_context\}\}/g;
const ruleMacro = /#\s*\{\{valoran_variables\}\}\s*([\s\S]*?)#\s*\{\{valoran_variables_end\}\}/g;

export function promptContextText(readState: () => State, context?: PromptContext) {
  if (context && !['story', 'inline', 'variables'].includes(context.purpose)) return '';
  const state = context?.state ?? readState();
  const data = context?.projection ?? modelState(state);
  const status = `<status_current_variable>\n${JSON.stringify(data)}\n</status_current_variable>`;
  if (context?.purpose === 'variables') return status;
  const project = createSourceContextProjector(state, data);
  const sources = Object.fromEntries(Object.keys(data.角色).flatMap(id => {
    const sourceId = state.角色[id]?._管理.来源档案id, source = sourceId && state._系统.来源档案[sourceId];
    const missing = source && project(sourceId, source);
    return missing ? [[sourceId, missing]] : [];
  }));
  return status + (Object.keys(sources).length
    ? `\n<readonly_source_context>\n${JSON.stringify(sources)}\n</readonly_source_context>` : '');
}

export function variableRuleContent(content: string, worker = true) {
  const text = content.replace(/#\s*\{\{(?:valoran_variables(?:_end)?|\/valoran_variables)\}\}/g, '').trim();
  return worker && /^\s*变量输出格式\s*:/m.test(text) ? `${workerTask}\n${text}` : text;
}

export function variableRuleText(content: string) {
  return variableRuleContent(content, false);
}

/** Expand card macros before entering shared native events; no request state lives in page macros. */
export function createPromptRequestContext(context: PromptContext): PromptRequestContext {
  return {
    updateWorldInfo: context.purpose === 'story' || context.purpose === 'inline',
    expandPrompt: text => text
      .replace(contextMacro, () => promptContextText(() => context.state, context))
      .replace(ruleMacro, (_match, content: string) => context.purpose === 'inline' ? variableRuleText(content) : ''),
  };
}

/** Content expansion only: Tavern owns the entry's role, position, depth and order. */
export function registerPromptMacros(readState: () => State) {
  const context = registerMacroLike(contextMacro, () => promptContextText(readState));
  const rules = registerMacroLike(
    ruleMacro,
    (_context, _match, content: string) => variableRuleText(content),
  );
  return () => { context.unregister(); rules.unregister(); };
}

type RuleEdit = { start: number; end: number; text: string };

/** Retain the exact spelling and layout outside the migrated YAML fields. */
function applyRuleEdits(content: string, edits: RuleEdit[]) {
  for (const { start, end, text } of edits.sort((a, b) => b.start - a.start || b.end - a.end))
    content = content.slice(0, start) + text + content.slice(end);
  return content;
}

function upgradeVariableFormat(content: string) {
  const oldReply = '回复只写一个 JSON 对象，唯一字段 JSONPatch 是补丁数组序列化后的字符串。对象前后不写计划、解释、正文或代码围栏。';
  const oldEmpty = '没有变化时直接返回 {"JSONPatch":"[]"}。';
  const inlineFormat = 'JSONPatch 内直接写 JSON 数组。正文中的说明和代码示例不作为变量更新。';
  const oldInline = 'JSONPatch 内直接写 JSON 数组；没有变化时写 []。正文中的说明和代码示例不作为变量更新。';
  if (!content.includes("'" + oldReply + "'") && !content.includes(oldEmpty) && !content.includes(oldInline)) return content;
  const contract = parseDocument(content).get('变量输出格式', true);
  if (!isMap(contract) || contract.flow) return content;
  const edits: RuleEdit[] = [];
  const inline = contract.get('正文同次', true);
  if (isSeq(inline)) {
    const item = inline.items.find(item => isScalar(item) && item.value === oldInline);
    if (isScalar(item) && item.range) {
      const [start, end] = item.range;
      edits.push({ start, end, text: content.slice(start, end).replace(oldInline, inlineFormat) });
    }
  }
  const rules = contract.get('rule', true);
  if (!isSeq(rules)) return applyRuleEdits(content, edits);
  const empty = rules.items.find(item => isScalar(item) && (item.value === oldEmpty || item.value === '后台结算' + oldEmpty));
  if (isScalar(empty) && empty.range && !rules.flow) {
    const [start, end, lineEnd] = empty.range;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const prefix = content.slice(lineStart, start);
    if (/^ *- +$/.test(prefix)) {
      const onlyItem = rules.items.length === 1;
      const text = onlyItem || empty.comment
        ? prefix.slice(0, prefix.indexOf('-')) + (onlyItem ? '[]' : '') + content.slice(end, lineEnd) : '';
      edits.push({ start: lineStart, end: lineEnd, text });
    }
  }
  const reply = rules.items.find(item => isScalar(item) && item.value === oldReply);
  if (!isScalar(reply) || !reply.range) return applyRuleEdits(content, edits);
  edits.push({ start: reply.range[0], end: reply.range[1], text: "'本轮为后台变量结算时，" + oldReply + "'" });
  if (!contract.has('正文同次') && contract.range) {
    const start = contract.range[0], indent = content.slice(content.lastIndexOf('\n', start - 1) + 1, start);
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const text = [
      '正文同次:',
      '  - 本轮同时生成剧情和变量时，先写正文，再在末尾输出 <UpdateVariable><JSONPatch>补丁数组</JSONPatch></UpdateVariable>。',
      '  - ' + inlineFormat,
      '  - \'同次示例：<UpdateVariable><JSONPatch>[{"op":"replace","path":"/玩家/当前状态/体力值","value":79}]</JSONPatch></UpdateVariable>\'',
      '',
    ].join(newline + indent);
    edits.push({ start, end: start, text });
  }
  const format = contract.items.find(pair => isScalar(pair.key) && pair.key.value === 'format');
  if (format && isScalar(format.key) && format.key.range && isScalar(format.value) &&
      format.value.type === 'BLOCK_LITERAL' && !contract.has('后台结算示例'))
    edits.push({ start: format.key.range[0], end: format.key.range[1], text: '后台结算示例' });
  return applyRuleEdits(content, edits);
}

/** Migrate the two shipped rule lines; edited sentences and all other text retain their owner. */
function upgradeVariableRules(content: string) {
  const oldGeneral = '下列类型描述保存后的字段，不是每轮填写清单。新增认知记实际来源，性质变化须有新依据。';
  const oldDebt = '仅有实际借款、欠款、待退款、应收应付时建立，保存对象、金额与条件；实际清偿或取消才改状态，并引用对应交易。不计入当前金币余额，不再另存获知来源。';
  if (!content.includes(oldGeneral) && !content.includes(oldDebt)) return content;
  const doc = parseDocument(content);
  const edits: RuleEdit[] = [];
  const general = doc.getIn(['变量更新规则', '通用约定'], true);
  if (isScalar(general) && general.range && general.type === 'BLOCK_LITERAL') {
    const [start, end] = general.range;
    const text = content.slice(start, end).replace(/^([ ]+)下列类型描述保存后的字段，不是每轮填写清单。新增认知记实际来源，性质变化须有新依据。(?=\r?$)/m,
      '$1写入变量的每项正文事实都保留原来的主语、人数和确定程度，在目标、计划或人物感受中转述时也一样。例如两名旅客一同进站，领队丢了行李，记作“两人进站，领队丢失行李”，其余人的行李状况未知。新增认知记实际来源，转述和推测保留原性质，性质变化须有新依据。下列字段按需填写。');
    edits.push({ start, end, text });
  }
  const debtRules = doc.getIn(['变量更新规则', '玩家', '资金', '未结事项', 'check'], true);
  if (isSeq(debtRules) && !debtRules.flow) {
    const debt = debtRules.items.find(item => isScalar(item) && item.value === oldDebt);
    if (isScalar(debt) && debt.range && debt.type === 'PLAIN') {
      const [start, end] = debt.range;
      const prefix = content.slice(content.lastIndexOf('\n', start - 1) + 1, start);
      const newline = content.includes('\r\n') ? '\r\n' : '\n';
      edits.push({ start, end, text:
        '实际借款、欠款、待退款或已确认的应收应付，写入本清单。明确答应支付或报销但尚未付款时记录对方与条件；只谈妥倍率就把倍率写在条件中，金额分留null。单方报价不建应付，同一承诺再次确认沿用原id。' + newline +
        prefix + '未结事项不计入余额，不另存获知来源。实际清偿后改为已结并关联对应交易；明确取消才改为取消。' });
    }
  }
  return applyRuleEdits(content, edits);
}

/** Sync the saved story mode while retaining edited rule text and native placement. */
export async function preparePromptWorldbook(inline = false, assertActive?: () => void) {
  assertActive?.();
  const book = getCharWorldbookNames('current').primary;
  if (!book) throw Error('角色卡未绑定世界书');
  const entries = await getWorldbook(book);
  assertActive?.();
  const prepareEntry = (entry: WorldbookEntry) => {
    let content = entry.content;
    if (entry.name === '变量列表')
      content = content.replace(/---\s*<status_current_variable>\s*\{\{format_message_variable::stat_data\}\}\s*<\/status_current_variable>/,
        '{{valoran_context}}');
    const variableRule = ['[mvu_update]变量更新规则', '[mvu_update]变量输出格式'].includes(entry.name.replace(/\s+/g, ''));
    if (entry.name.replace(/\s+/g, '') === '[mvu_update]变量输出格式') content = upgradeVariableFormat(content);
    if (entry.name.replace(/\s+/g, '') === '[mvu_update]变量更新规则') content = upgradeVariableRules(content);
    if (variableRule) {
      content = content.replaceAll('# {{/valoran_variables}}', '# {{valoran_variables_end}}');
      if (!content.startsWith('# {{valoran_variables}}'))
        content = `# {{valoran_variables}}\n${content.trimEnd()}\n# {{valoran_variables_end}}\n`;
    }
    return content === entry.content && (!variableRule || entry.enabled === inline)
      ? entry : { ...entry, content, enabled: variableRule ? inline : entry.enabled };
  };
  if (entries.every(entry => prepareEntry(entry) === entry)) return;
  if (book !== getCharWorldbookNames('current').primary) throw Error('准备资料时世界书已切换');
  let changed: WorldbookEntry[] = [];
  await updateWorldbookWith(book, currentEntries => {
    assertActive?.();
    const prepared = currentEntries.map(prepareEntry);
    changed = prepared.filter((entry, index) => entry !== currentEntries[index]);
    return prepared;
  }, { render: 'immediate' });
  const saved = await getWorldbook(book);
  assertActive?.();
  if (book !== getCharWorldbookNames('current').primary || changed.some(item =>
    saved.find(entry => entry.uid === item.uid)?.content !== item.content ||
    saved.find(entry => entry.uid === item.uid)?.enabled !== item.enabled))
    throw Error('请求资料世界书保存读回不一致');
}
