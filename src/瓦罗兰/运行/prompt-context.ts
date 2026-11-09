import type { State } from './core';
import { modelState } from './character-activity';
import { createSourceContextProjector } from './source-context';
import { workerTask } from './worker-task';

export type PromptPurpose = 'story' | 'variables' | 'knowledge' | 'novel';
type PromptContext = { purpose: PromptPurpose; state: State; projection?: Record<string, any> };
let current: PromptContext | undefined;

/** Requests from the card are serialized by its existing runtime. Never save this view to MVU. */
export async function withPromptContext<T>(context: PromptContext, generate: () => Promise<T>): Promise<T> {
  const previous = current;
  current = context;
  try {
    return await generate();
  } finally {
    current = previous;
  }
}

export function promptContextText(readState: () => State) {
  if (current && !['story', 'variables'].includes(current.purpose)) return '';
  const data = current?.projection ?? modelState(current?.state ?? readState());
  const status = `<status_current_variable>\n${JSON.stringify(data)}\n</status_current_variable>`;
  if (current?.purpose === 'variables') return status;
  const state = current?.state ?? readState(), project = createSourceContextProjector(state, data);
  const sources = Object.fromEntries(Object.keys(data.角色).flatMap(id => {
    const sourceId = state.角色[id]?._管理.来源档案id, source = sourceId && state._系统.来源档案[sourceId];
    const missing = source && project(sourceId, source);
    return missing ? [[sourceId, missing]] : [];
  }));
  return status + (Object.keys(sources).length
    ? `\n<readonly_source_context>\n${JSON.stringify(sources)}\n</readonly_source_context>` : '');
}

export function variableRuleContent(content: string) {
  const text = content.replace(/#\s*\{\{(?:valoran_variables(?:_end)?|\/valoran_variables)\}\}/g, '').trim();
  return /^\s*变量输出格式\s*:/m.test(text) ? `${workerTask}\n${text}` : text;
}

export function variableRuleText(content: string) {
  return current?.purpose === 'variables' ? variableRuleContent(content) : '';
}

/** Content expansion only: Tavern owns the entry's role, position, depth and order. */
export function registerPromptMacros(readState: () => State) {
  const context = registerMacroLike(/\{\{valoran_context\}\}/g, () => promptContextText(readState));
  const rules = registerMacroLike(
    /#\s*\{\{valoran_variables\}\}\s*([\s\S]*?)#\s*\{\{valoran_variables_end\}\}/g,
    (_context, _match, content: string) => variableRuleText(content),
  );
  return () => { context.unregister(); rules.unregister(); };
}

/** Keep edited rule text and placement; rules stay disabled outside per-request inputs. */
export async function preparePromptWorldbook() {
  const book = getCharWorldbookNames('current').primary;
  if (!book) throw Error('角色卡未绑定世界书');
  const entries = await getWorldbook(book);
  const changed = entries.flatMap(entry => {
    let content = entry.content;
    if (entry.name === '变量列表')
      content = content.replace(/---\s*<status_current_variable>\s*\{\{format_message_variable::stat_data\}\}\s*<\/status_current_variable>/,
        '{{valoran_context}}');
    const variableRule = ['[mvu_update]变量更新规则', '[mvu_update]变量输出格式'].includes(entry.name.replace(/\s+/g, ''));
    if (variableRule) {
      content = content.replaceAll('# {{/valoran_variables}}', '# {{valoran_variables_end}}');
      if (!content.startsWith('# {{valoran_variables}}'))
        content = `# {{valoran_variables}}\n${content.trimEnd()}\n# {{valoran_variables_end}}\n`;
    }
    return content === entry.content && (!variableRule || !entry.enabled)
      ? [] : [{ uid: entry.uid, content, enabled: variableRule ? false : entry.enabled }];
  });
  if (!changed.length) return;
  if (book !== getCharWorldbookNames('current').primary) throw Error('准备资料时世界书已切换');
  await updateWorldbookWith(book, currentEntries => currentEntries.map(entry => {
    const replacement = changed.find(item => item.uid === entry.uid);
    return replacement ? { ...entry, content: replacement.content, enabled: replacement.enabled } : entry;
  }), { render: 'immediate' });
  const saved = await getWorldbook(book);
  if (book !== getCharWorldbookNames('current').primary || changed.some(item =>
    saved.find(entry => entry.uid === item.uid)?.content !== item.content ||
    saved.find(entry => entry.uid === item.uid)?.enabled !== item.enabled))
    throw Error('请求资料世界书保存读回不一致');
}
