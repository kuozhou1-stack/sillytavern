const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createHash, webcrypto } = require('node:crypto');
const { z } = require('zod');
const root = path.resolve(__dirname, '..');

function load(file, crypto, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, crypto, Uint8Array, Uint32Array, ArrayBuffer, DataView,
    z, URL, AbortSignal, TextDecoder,
    require(name) {
      assert.ok(name in imports, `未提供测试依赖：${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

const cryptoFile = '运行/browser-crypto.ts';
const fallback = () => load(cryptoFile, { getRandomValues: values => webcrypto.getRandomValues(values) });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('UUID 原生优先，保留方法接收者；HTTP 回退仍使用安全随机源与 UUID v4 格式', () => {
  const native = { randomUUID() { assert.equal(this, native); return 'native-id'; }, getRandomValues() { throw Error('不应回退'); } };
  assert.equal(load(cryptoFile, native).randomUUID(), 'native-id');
  const api = fallback();
  const ids = new Set();
  for (let i = 0; i < 10000; i++) {
    const id = api.randomUUID();
    assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 10000);
  assert.throws(() => load(cryptoFile, undefined).randomUUID(), /缺少安全随机源/);
  assert.throws(() => load(cryptoFile, {}).randomUUID(), /缺少安全随机源/);
});

test('SHA-256 在无 subtle/无 crypto 时匹配标准向量及填充边界，不改变输入', async () => {
  const api = fallback();
  assert.equal(await api.sha256(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await api.sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const size of [1, 55, 56, 63, 64, 65, 127, 128, 1000000]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 13) & 255);
    const before = bytes.slice();
    assert.equal(await api.sha256(bytes), digest(bytes), `字节长度 ${size}`);
    assert.deepEqual(bytes, before);
  }
  const view = new TextEncoder().encode('xx瓦洛兰角色目录yy').subarray(2, -2);
  assert.equal(await api.sha256(view), digest(view));
  assert.equal(await load(cryptoFile, undefined).sha256(view), digest(view));
});

test('SHA-256 原生路径保留方法接收者并与备用路径得到相同摘要', async () => {
  let calls = 0;
  const subtle = {
    digest(algorithm, bytes) {
      assert.equal(this, subtle);
      assert.equal(algorithm, 'SHA-256');
      calls++;
      return webcrypto.subtle.digest(algorithm, bytes);
    },
  };
  const bytes = new TextEncoder().encode('本地目录哈希核验').subarray(3);
  const actual = await load(cryptoFile, { subtle }).sha256(bytes);
  assert.equal(actual, await fallback().sha256(bytes));
  assert.equal(calls, 1);
});

test('HTTP 备用 SHA 仍阻止篡改目录数据，失败后允许重新读取并校验', async () => {
  const api = fallback();
  let parseCalls = 0;
  const catalogApi = load('界面/桌面端/utils/character-catalog.ts', {}, {
    '../../../运行/browser-crypto': api,
    './character-batch': {
      parseCharacterBatch(rows) { parseCalls++; return rows.map(row => ({ result: { success: true, charId: row.name } })); },
      selectedCharacters: rows => rows,
    },
  });
  const content = new TextEncoder().encode(JSON.stringify({ format: '符文都市角色资源/1', characters: { npc: { 姓名: '离线样本' } } }));
  const catalog = { dataUrl: 'http://fixture.invalid/characters.json', sha256: digest(content), entries: [{ id: 'npc', name: '离线样本' }] };
  let calls = 0;
  let responseBytes = new TextEncoder().encode('被篡改的内容');
  const request = async () => { calls++; return { ok: true, arrayBuffer: async () => responseBytes.slice().buffer }; };
  await assert.rejects(() => catalogApi.catalogCharacters(catalog, ['npc'], [], request), /版本与名录不一致/);
  assert.equal(parseCalls, 0);
  responseBytes = content;
  const result = await catalogApi.catalogCharacters(catalog, ['npc'], [], request);
  assert.equal(result.length, 1);
  assert.equal(parseCalls, 1);
  assert.equal(calls, 2);
});
