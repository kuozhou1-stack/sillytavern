const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict'), { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../工具/构建.mjs'), 'utf8');
const body = source.slice(source.indexOf('let compiler;'), source.indexOf('\nif (watching) compiler = webpack'));
function fixture(watching = true, writeError) {
  let write, closed = 0;
  const emitted = [], errors = [], processState = { exitCode: 0 };
  const compilerStub = {
    close(callback) { closed++; callback(); },
  };
  const context = {
    fs: {
      readdirSync(dir) { return dir === '/card' ? ['运行/index.ts'] : ['脚本/index.js']; },
      readFileSync() { return Buffer.from('source'); },
      statSync() { return { isFile: () => true }; },
      writeFileSync(file, text) {
        assert.equal(emitted.length, 0, '写入成功前不能发布刷新');
        write = { file, text };
        if (writeError) throw writeError;
      },
    },
    root: '/card', outputRoot: '/dist', preserved: [], watching, release: false, catalogUrl: undefined,
    configs: [{ entry: '/card/脚本/index.ts' }], compilerStub, createHash, path, process: processState,
    console: { log() {}, info() {}, error(error) { errors.push(error); } },
    listener: watching ? { emit(...args) { emitted.push(args); } } : undefined,
  };
  const api = vm.runInNewContext('let buildReady=false, publishedFiles="";\n' + body +
    '\ncompiler=compilerStub;({done,ready:()=>buildReady});', context);
  const stats = { hasErrors: () => false, toString: () => '' };
  return { api, stats, emitted, errors, processState, write: () => write, closed: () => closed };
}
test('整卡构建状态写入成功之后才发布刷新事件', () => {
  const f = fixture(); f.api.done(null, f.stats);
  assert(f.write().file.endsWith('构建状态.json'));
  assert.equal(JSON.parse(f.write().text).errors, 0);
  assert.equal(f.api.ready(), true); assert.deepEqual(f.emitted, [['iframe_updated']]);
});
test('Windows构建状态写入失败清楚记录，不终止监听或发布半成品', () => {
  const error = Object.assign(Error('manifest busy'), { code: 'UNKNOWN' }), f = fixture(true, error);
  assert.doesNotThrow(() => f.api.done(null, f.stats));
  assert.deepEqual(f.errors, [error]); assert.equal(f.api.ready(), false);
  assert.equal(f.emitted.length, 0); assert.equal(f.closed(), 0);
});
test('非监听构建的状态写入失败返回失败并关闭编译器', () => {
  const f = fixture(false, Error('manifest failed')); f.api.done(null, f.stats);
  assert.equal(f.processState.exitCode, 1); assert.equal(f.closed(), 1);
});
