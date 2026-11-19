import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Keep the editable sources, build inputs and upstream notices beside each release. */
export function packageRuntimeSource(project, root, outputRoot, inputs, catalogUrl) {
  const card = path.relative(project, root).replaceAll('\\', '/');
  const names = new Set([
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'webpack.config.ts', 'postcss.config.js', 'tsconfig.json', 'LICENSE',
    ...fs.readdirSync(project).filter(file => file.endsWith('.d.ts')),
    `${card}/schema.ts`, `${card}/发布/配置.json`,
    `${card}/工具/构建.mjs`, `${card}/工具/打包运行源码.mjs`,
  ]);
  for (const directory of ['@types', 'util', ...['运行', '界面', '脚本'].map(folder => `${card}/${folder}`)]) {
    for (const relative of fs.readdirSync(path.join(project, directory), { recursive: true })) {
      const file = path.join(directory, relative).replaceAll('\\', '/');
      if (fs.statSync(path.join(project, file)).isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs|vue|scss|css|html|json|txt|md|yaml|yml|svg)$/.test(file)) names.add(file);
    }
  }
  const files = [...names].sort().map(file => ({ file, bytes: fs.readFileSync(path.join(project, file)) }));
  const byName = new Map(files.map(file => [file.file, file.bytes]));
  for (const input of inputs) {
    const bytes = byName.get(`${card}/${input.path}`);
    if (!bytes || hash(bytes) !== input.sha256) throw Error(`源码与构建记录不一致：${input.path}`);
  }
  const sourceDir = path.join(outputRoot, 'source');
  fs.mkdirSync(sourceDir, { recursive: true });
  const notice = `# 瓦罗兰运行源码\n\n本目录的 source.tar.gz 包含本次运行产物对应的可编辑源码、类型定义、依赖锁定文件、pnpm 工作区配置、构建脚本及许可证。source-manifest.json 记录各源文件的 SHA-256。\n\n## 构建\n\n使用已验证的 pnpm 11.6.0，解压后在根目录执行 pnpm install --frozen-lockfile，然后执行以下命令。Node.js 应支持 TypeScript 类型擦除及 fs.globSync，与当前构建环境相同的版本为 ${process.version}。\n\n\`\`\`powershell\nnode src/瓦罗兰/工具/构建.mjs --release --output=src/瓦罗兰/发布/重建/dist/瓦罗兰 --catalog-url=${catalogUrl}\n\`\`\`\n\n## 来源与许可\n\n- 原项目许可证保留在根目录 LICENSE。\n- 卡内世界书扫描和预设组装移植自 SillyTavern 1.18.0，固定提交 51ad27fb86d39a3daca3adaa970375c9670c12df。来源地址 https://github.com/SillyTavern/SillyTavern/tree/51ad27fb86d39a3daca3adaa970375c9670c12df 。上游 AGPL 许可证保留在 src/瓦罗兰/运行/generation/SILLYTAVERN-LICENSE.txt，修改范围见对应源文件头。\n- 发送适配参考 Tavern Helper 固定提交 b1566767a111348aaa007e0044e786835330f884。来源地址 https://github.com/N0VI028/JS-Slash-Runner/tree/b1566767a111348aaa007e0044e786835330f884 。PolyForm Noncommercial 1.0.0 文本保留在 src/瓦罗兰/运行/generation/TAVERN-HELPER-LICENSE.txt。\n- 其余复用声明、版权注释和依赖版本随对应源文件及 pnpm-lock.yaml 保留。地图由 assets/maps/远程素材.json 中的既有地址加载，归档保留该目录与资源定位。\n\n## 请求事件合同\n\n卡内发送使用请求自己的参数，经原生 ChatCompletionService 发送。它跳过共享 CHAT_COMPLETION_SETTINGS_READY 事件，因此依赖该事件修改出站参数的扩展需要另行适配。正文/推理流式事件继续携带 generation_id。卡内完成以本次调用返回为准，停止绑定本卡请求，不广播会清理其他助手请求的公共结束事件。ST-Prompt-Template 1.17.9 的公开求值接口适用于关闭沙盒的出站模板，每次卡内求值有独立数字 runID。沙盒开启时，普通文本照常发送；仍待展开的模板会在模型请求前提示当前接口限制。st-chatu8 3.2.1 的普通自动插图窗口依赖公共结束事件。本卡正文中生成的插图按钮可手动使用；本卡不会主动打开该窗口。\n`;
  const manifest = { node: process.version, catalogUrl, files: files.map(({ file, bytes }) => ({ path: file, sha256: hash(bytes), bytes: bytes.length })) };
  fs.writeFileSync(path.join(sourceDir, 'README.md'), notice);
  fs.writeFileSync(path.join(sourceDir, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'valoran-runtime-source-'));
  try {
    for (const { file, bytes } of files) {
      const target = path.join(stage, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
    }
    fs.writeFileSync(path.join(stage, 'SOURCE-README.md'), notice);
    fs.writeFileSync(path.join(stage, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const archive = path.join(sourceDir, 'source.tar.gz');
    const result = spawnSync('tar', ['-czf', archive, '-C', stage, '.'], { encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) throw result.error ?? Error(`源码归档失败：${result.stderr}`);
  } finally {
    if (path.dirname(stage) !== path.resolve(os.tmpdir())) throw Error('源码临时目录位置不符');
    fs.rmSync(stage, { recursive: true, force: true });
  }
  return manifest;
}
