// Scoped wrapper around the project webpack configuration. Preserve other cards and shared declarations.
import webpack from 'webpack';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Server } from 'socket.io';
const root = path.resolve(import.meta.dirname, '..');
const project = path.resolve(root, '../..');
const localDist = path.join(project, 'dist/瓦罗兰');
process.chdir(project);
process.env.TAVERN_BUILD_TARGET = '瓦罗兰';
const { default: factories } = await import('../../../webpack.config.ts');
const watching = process.argv.includes('--watch');
const release = process.argv.includes('--release');
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outputRoot = option('output') ? path.resolve(option('output'))
  : release ? path.join(root, '发布/当前/dist/瓦罗兰') : localDist;
const catalogUrl = option('catalog-url') ?? (release
  ? JSON.parse(fs.readFileSync(path.join(root, '发布/配置.json'), 'utf8')).catalogUrl : undefined);
if (release && watching) throw Error('正式构建不能开启实时监听');
if (release && (!catalogUrl || !/^https:\/\//.test(catalogUrl))) throw Error('正式构建需要公开角色名录地址');
if (outputRoot !== localDist && !outputRoot.startsWith(path.join(root, '发布') + path.sep))
  throw Error('独立构建目录必须位于瓦罗兰/发布目录');
const runtimeEntries = new Set([
  '界面/桌面端/index.ts',
  '脚本/变量结构/index.ts',
  '脚本/辅助API/index.ts',
  '脚本/流式同层/index.ts',
].map(file => path.join(root, file)));
const configs = factories.map(f =>
  typeof f === 'function' ? f({}, { mode: watching ? 'development' : 'production', watch: watching }) : f,
).filter(config => typeof config.entry === 'string' && runtimeEntries.has(path.resolve(config.entry)));
if (configs.length !== runtimeEntries.size) throw Error('当前卡构建入口不完整，停止构建');
const preserved = ['auto-imports.d.ts', 'components.d.ts'].map(file => ({
  file,
  bytes: fs.existsSync(file) ? fs.readFileSync(file) : null,
}));
for (const c of configs) {
  c.mode = watching ? 'development' : 'production';
  c.devtool = release ? false : 'source-map';
  c.output.path = path.join(outputRoot, path.relative(localDist, c.output.path));
  c.watch = watching;
  c.watchOptions = {
    ...c.watchOptions,
    poll: watching ? 1000 : undefined,
    ignored: ['**/node_modules/**', '**/auto-imports.d.ts', '**/components.d.ts', '**/文档/**', '**/dist/**'],
  };
  c.plugins = c.plugins.filter(p => !['schema_dump', 'tavern_sync', 'watch_tavern_helper'].includes(p?.apply?.name));
  if (release) c.plugins.push(new webpack.DefinePlugin({ __CHENGWAN_CHARACTER_CATALOG_URL__: JSON.stringify(catalogUrl) }));
  c.plugins.push({
    apply(compiler) {
      const outputFs = compiler.outputFileSystem;
      const write = outputFs.writeFile.bind(outputFs);
      // 本地静态服务或编辑器短暂占用 Windows 产物时重试；各编译器独立封装，不修改共享 fs。
      compiler.outputFileSystem = Object.assign(Object.create(outputFs), {
        writeFile(file, data, callback) {
          let retries = 0;
          const attempt = () => write(file, data, error => {
            if (error && ['UNKNOWN', 'EBUSY', 'EPERM'].includes(error.code) && retries++ < 12) {
              setTimeout(attempt, 100);
              return;
            }
            callback(error);
          });
          attempt();
        },
      });
    },
  });
}
// Publish once after the whole scoped build succeeds, rather than once per entry.
const listener = watching ? new Server(6621, { cors: { origin: '*' } }) : undefined;
let buildReady = false;
let publishedFiles = '';
listener?.on('connection', socket => {
  console.info('[瓦洛兰监听] 酒馆连接：' + socket.id);
  if (buildReady) socket.emit('iframe_updated');
});
let compiler;
const done = (error, stats) => {
  for (const { file, bytes } of preserved)
    if (bytes && (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes))) fs.writeFileSync(file, bytes);
  if (error || stats?.hasErrors()) {
    console.error(error ?? stats.toString({ all: false, errors: true }));
    if (!watching) process.exitCode = 1;
    return;
  }
  console.log(stats.toString({ all: false, errors: true, warnings: true, timings: true }));
  const dist = outputRoot;
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const inputs = fs
    .readdirSync(root, { recursive: true })
    .filter(
      file => (/^(界面|运行|脚本)[\\/]/.test(file) && /\.(vue|ts|scss|html|json)$/.test(file)) || file === 'schema.ts',
    )
    .map(file => ({ path: file.replaceAll('\\', '/'), sha256: digest(path.join(root, file)) }));
  const outputs = fs
    .readdirSync(dist, { recursive: true })
    .filter(file => fs.statSync(path.join(dist, file)).isFile() && file !== '构建状态.json')
    .map(file => ({ path: file.replaceAll('\\', '/'), sha256: digest(path.join(dist, file)) }));
  fs.writeFileSync(
    path.join(dist, '构建状态.json'),
    JSON.stringify(
      { time: new Date().toISOString(), watching, release, catalogUrl: catalogUrl ?? null,
        entries: configs.map(c => c.entry), inputs, outputs, errors: 0 },
      null,
      2,
    ),
  );
  buildReady = true;
  const files = outputs
    .filter(row => /\.(?:js|html)$/.test(row.path))
    .map(row => row.path + ':' + row.sha256)
    .sort()
    .join('\n');
  if (listener && files !== publishedFiles) {
    publishedFiles = files;
    listener.emit('iframe_updated');
    console.info('[瓦洛兰监听] 全部产物已更新，已推送一次刷新事件');
  }
  if (!watching) compiler.close(() => {});
};
if (watching) compiler = webpack(configs, done);
else {
  compiler = webpack(configs);
  compiler.run(done);
}
