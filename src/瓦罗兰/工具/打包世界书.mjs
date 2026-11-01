import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { root, generate } from './生成派生产物.mjs';
import { nativeBundleSource } from './native-bundle-source.mjs';

// 复用仓库现有 tavern_sync 的解析器、外链解析和原生序列化器。
// 临时模块只将 CLI 启动入口改为类导出，避免触发无关配置及联网更新检查。
export async function bundleWorldbook({ write = true } = {}) {
  if (write) generate();
  const project = path.resolve(root, '../..');
  const source = fs.readFileSync(path.join(project, 'tavern_sync.mjs'), 'utf8');
  const marker = /\r?\nprogram\r?\n\s*\.name\('世界书同步脚本'\)/;
  const index = source.search(marker);
  if (index < 0) throw new Error('现有同步工具入口已变化，请核对后适配；不另造格式');
  const dir = fs.mkdtempSync(path.join(root, '工具/.bundle-'));
  const script = path.join(dir, 'tavern_sync.mjs');
  const settings = path.join(dir, 'tavern_sync.yaml');
  if (!dir.startsWith(path.join(root, '工具') + path.sep)) throw new Error('临时目录越界');
  try {
    fs.writeFileSync(script, nativeBundleSource(source, index, 'Worldbook_syncer'));
    fs.writeFileSync(settings, YAML.stringify({ 配置: {} }));
    const { Worldbook_syncer } = await import(pathToFileURL(script));
    const output = path.join(root, '瓦洛兰.worldbook.json');
    const syncer = new Worldbook_syncer('瓦洛兰', '瓦洛兰', path.join(root, '世界书/index.yaml'), output);
    const parsed = syncer.get_parsed_local();
    if (typeof parsed === 'string') throw new Error(parsed);
    const { result_data, error_data } = syncer.do_bundle(parsed);
    if (Object.keys(error_data).length) throw new Error(YAML.stringify(error_data));
    if (write) fs.writeFileSync(output, JSON.stringify(result_data, null, 2) + '\n');
    return result_data;
  } finally {
    // 仅清理本次创建的两个确定文件及已空的临时目录。
    for (const file of [script, settings]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const result = await bundleWorldbook();
  console.log(`已用项目 tavern_sync 打包 ${Object.keys(result.entries).length} 个世界书条目。`);
}
