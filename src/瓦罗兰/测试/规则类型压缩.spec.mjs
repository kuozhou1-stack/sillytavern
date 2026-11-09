import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import YAML from 'yaml';
import { read, root } from '../工具/生成派生产物.mjs';
import { atPath, compactRuleTypes, ruleLeaves, ruleTypeDeclarations, ruleTypeOf, typeOf } from '../工具/schema-utils.mjs';
import { renderRuleTypes } from '../工具/生成规则类型.mjs';

const input = read('世界书/变量/变量更新规则.yaml');
const rendered = renderRuleTypes(input);
const rules = YAML.parse(rendered).变量更新规则;
const shared = rules.公共类型定义 ?? '';
const leaves = ruleLeaves(rules);

function compile(source) {
  // A virtual source and noEmit keep tests independent of generated files and live rules.
  const file = path.join(root, '测试', '规则类型压缩.virtual.ts');
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    types: [],
    lib: ['lib.es2022.d.ts'],
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...args) =>
    path.resolve(name) === file
      ? ts.createSourceFile(file, source, options.target, true)
      : getSourceFile(name, ...args);
  host.writeFile = () => {
    throw new Error('规则类型测试不得写文件');
  };
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
}

test('所有规则共享类型与Schema完整类型双向等价，原独立ruleTypeOf仍可单独编译', () => {
  assert(leaves.filter(({ value }) => value.type).length >= 35);
  compile(
    leaves
      .map(({ parts, value }, i) => {
        if (!value.type) return '';
        const full = typeOf(atPath(parts));
        const check = `type 完整值 = ${full}; type 一致 = [变量值] extends [完整值] ? ([完整值] extends [变量值] ? true : false) : false; const 验证: true = null as unknown as 一致;`;
        return `namespace Shared${i} { ${ruleTypeDeclarations(value.type, shared)} ${check} }
      namespace Standalone${i} { ${ruleTypeDeclarations(ruleTypeOf(atPath(parts)))} ${check} }`;
      })
      .join('\n'),
  );
});

test('主要/次要分支的字段、可选性、null与枚举保持精确', () => {
  compile(`${ruleTypeDeclarations(rules.角色.type, shared)}
    type 完整人物 = (${typeOf(atPath(['角色']))})[string];
    type 人物 = 变量值[string];
    type 主要 = Extract<人物, { 层级: '主要' }>;
    type 次要 = Extract<人物, { 层级: '次要' }>;
    type 原主要 = Extract<完整人物, { 层级: '主要' }>;
    type 原次要 = Extract<完整人物, { 层级: '次要' }>;
    type 相同<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    type 必须<T extends true> = T;
    type 主字段 = 必须<相同<keyof 主要, keyof 原主要>>;
    type 次字段 = 必须<相同<keyof 次要, keyof 原次要>>;
    type 主外貌字段 = 必须<相同<keyof 主要['外貌'], keyof 原主要['外貌']>>;
    type 次外貌字段 = 必须<相同<keyof 次要['外貌'], keyof 原次要['外貌']>>;
    type 经历字段 = 必须<相同<keyof 主要['经历'], keyof 原主要['经历']>>;
    type 性特征适用 = 必须<{} extends Pick<主要, '性特征'> ? true : false>;
    type 三围适用 = 必须<{} extends Pick<主要['外貌'], '三围信息' | '罩杯'> ? true : false>;
    type 层级必填 = 必须<{} extends Pick<人物, '层级'> ? false : true>;
    type 次要无经历 = 必须<'经历' extends keyof 次要 ? false : true>;
    type 种族未知 = 必须<相同<人物['种族'], string | null>>;
    type 信任未知 = 必须<相同<人物['关系网'][string]['信任度'], number | null>>;
    type 日期枚举 = 必须<相同<主要['经历']['最近经历'][string]['日期精度'], '日' | '月' | '年' | '未知'>>;
    type 公开结构 = 必须<Extract<keyof 人物, \`_\${string}\`> extends never ? true : false>;
  `);
});

test('只重建type和公共定义，check、format、字段清单、分组及注释不改变', () => {
  function withoutTypes(text) {
    const value = YAML.parse(text);
    delete value.变量更新规则.公共类型定义;
    for (const leaf of ruleLeaves(value.变量更新规则)) delete leaf.value.type;
    return value;
  }
  assert.deepEqual(withoutTypes(rendered), withoutTypes(input));
  assert.deepEqual(Object.keys(YAML.parse(rendered)), ['变量更新规则']);
  for (const { parts, value } of leaves) {
    const type = ruleTypeOf(atPath(parts));
    assert.equal(Object.hasOwn(value, 'type'), !['string', 'string | null', 'null | string'].includes(type));
  }
  assert(renderRuleTypes('# 作者注释保留\n' + input).startsWith('# 作者注释保留\n'));
  assert.equal(renderRuleTypes(rendered), rendered);
});

test('公共别名计入总成本后仍显著减少类型文本，没有无用或未定义别名', () => {
  const original = leaves
    .filter(({ value }) => value.type)
    .reduce((sum, { parts }) => sum + ruleTypeOf(atPath(parts)).length, 0);
  const compact = shared.length + leaves.reduce((sum, { value }) => sum + (value.type?.length ?? 0), 0);
  assert(compact < original * 0.8, `类型压缩不足：${original} → ${compact}`);
  const source = ts.createSourceFile('shared.ts', shared, ts.ScriptTarget.Latest, true);
  const names = source.statements.map(node => node.name.text);
  assert.equal(new Set(names).size, names.length);
  const references = new Map();
  const all = ts.createSourceFile(
    'all.ts',
    shared + '\n' + leaves.map(({ value }, i) => (value.type ? `type 规则${i} = ${value.type};` : '')).join('\n'),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = node => {
    if (ts.isTypeReferenceNode(node)) references.set(node.typeName.text, (references.get(node.typeName.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(all);
  for (const name of names) assert((references.get(name) ?? 0) >= 2, `无效公共别名：${name}`);
  for (const name of references.keys()) assert(names.includes(name), `未定义公共别名：${name}`);
});

test('不因格式压缩改写字符串枚举内部的空格，短类型不强加公共别名', () => {
  const value =
    '{ 标记: "保留  两个空格" | " A "; 年: number; 月: number; 日: number; 时: number; 分: number; } | null';
  const result = compactRuleTypes([value, value], ['示例', '示例']);
  compile(
    result.types
      .map(
        (type, i) => `namespace Case${i} {
    ${ruleTypeDeclarations(type, result.shared)}
    type 原值 = ${value};
    const 前向: 原值 = null as unknown as 变量值;
    const 后向: 变量值 = null as unknown as 原值;
  }`,
      )
      .join('\n'),
  );
  assert((result.shared + result.types.join('\n')).includes('保留  两个空格'));
  assert.deepEqual(compactRuleTypes(['number | null', 'boolean']), { shared: '', types: ['number | null', 'boolean'] });
});

test('合并规则的字段类型不相同或路径无效时拒绝渲染', () => {
  assert.throws(() => renderRuleTypes('变量更新规则:\n  不存在:\n    check: [保持]\n'), /规则路径不存在/);
  assert.throws(
    () => renderRuleTypes('变量更新规则:\n  玩家:\n    ${身份年龄}:\n      字段: [身份, 年龄]\n      check: [保持]\n'),
    /合并规则的字段类型不相同/,
  );
});
