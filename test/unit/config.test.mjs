import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadApiKey, DEFAULTS } from '../../src/config.mjs';

// 临时目录须随测试清理（清理铁律；曾泄漏 /tmp/jm-cfg-* 百余目录）
function tmpToml(content, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-cfg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, 'config.toml');
  fs.writeFileSync(p, content);
  return p;
}

test('TOML 加载 + 默认值', (t) => {
  const cfg = loadConfig(tmpToml('dailyCreditCap = 300\n', t), {});
  assert.equal(cfg.dailyCreditCap, 300);
  assert.equal(cfg.port, DEFAULTS.port);
});

test('env 覆盖优先于文件', (t) => {
  const cfg = loadConfig(tmpToml('dailyCreditCap = 300\n', t), { JMAPI_DAILY_CREDIT_CAP: '700' });
  assert.equal(cfg.dailyCreditCap, 700);
});

test('积分帽 0 = 关闭且带启动警告标记', (t) => {
  assert.equal(loadConfig(tmpToml('dailyCreditCap = 0\n', t), {}).capDisabledWarning, true);
  assert.equal(loadConfig(tmpToml('', t), {}).capDisabledWarning, false);
});

test('非法配置拒绝（负例）', (t) => {
  assert.throws(() => loadConfig(tmpToml('dailyCreditCap = -5\n', t), {}), /非法/);
  assert.throws(() => loadConfig(tmpToml('port = "abc"\n', t), {}), /非法/);
});

test('key：env 优先，其次 secret 文件；皆无 → null（fail-closed 由入口执行）', (t) => {
  const p = tmpToml('', t);
  fs.writeFileSync(p, '  file-key  ');
  assert.equal(loadApiKey({ JMAPI_API_KEY: 'env-key', JMAPI_API_KEY_FILE: p }), 'env-key');
  assert.equal(loadApiKey({ JMAPI_API_KEY_FILE: p }), 'file-key');
  assert.equal(loadApiKey({}), null);
});