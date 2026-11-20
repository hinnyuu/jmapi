// 依赖许可证白名单门禁：读 node_modules 各 package.json 的 license 字段（npm ls --json 不含）。
import fs from 'node:fs';
import path from 'node:path';

const ALLOW = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'PSF', 'Python-2.0', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0']);
const bad = [];

function licenseOf(pkg) {
  const lic = pkg.license || (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type).join(' OR ') : null) || 'UNKNOWN';
  return String(typeof lic === 'object' ? lic.type : lic);
}

function ok(lic) {
  return lic.split(/\s+OR\s+|\//).some((p) => ALLOW.has(p.trim()));
}

function walk(dir, depth = 0) {
  if (depth > 6) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.name.startsWith('@')) { walk(p, depth); continue; }
    const manifest = path.join(p, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const lic = licenseOf(pkg);
      if (!ok(lic)) bad.push(`${pkg.name}@${pkg.version}: ${lic}`);
    }
    const nested = path.join(p, 'node_modules');
    if (fs.existsSync(nested)) walk(nested, depth + 1);
  }
}

walk('node_modules');
if (bad.length) {
  console.error('许可证不在白名单：\n' + bad.join('\n'));
  process.exit(1);
}
console.log('依赖许可证白名单通过');