import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const project = path.resolve(root, '../..');
const files = fs.readdirSync(path.join(root, '测试')).filter(file => /\.spec\.(cjs|mjs)$/.test(file)).sort();
const results = [];
let next = 0;

// Each suite owns globals and its TypeScript loader. Run it in its own ordinary
// process, avoiding both cross-suite state and Node's test-child IPC failure.
async function run(file) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', '--test-reporter=tap', path.join(root, '测试', file)], {
      cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
  const counts = Object.fromEntries([...result.output.matchAll(/^# (tests|pass|fail|skipped|cancelled) (\d+)\s*$/gm)]
    .map(([, key, value]) => [key, Number(value)]));
  const passed = result.code === 0 && counts.fail === 0 && counts.cancelled === 0;
  results.push({ file, passed, code: result.code, signal: result.signal, ...counts });
  if (!passed) console.error(file + '\n' + result.output);
}

await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < files.length) await run(files[next++]);
}));
results.sort((a, b) => a.file.localeCompare(b.file, 'zh-CN'));
const totals = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'cancelled']
  .map(key => [key, results.reduce((sum, row) => sum + (row[key] ?? 0), 0)]));
const report = { files: results.length, totals, failures: results.filter(row => !row.passed), results };
const destination = process.argv.find(arg => arg.startsWith('--report='))?.slice('--report='.length);
if (destination) {
  const file = path.resolve(project, destination);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ files: report.files, ...totals, failedFiles: report.failures.length }));
if (report.failures.length) process.exitCode = 1;
