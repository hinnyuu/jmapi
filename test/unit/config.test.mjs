import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadApiKey, DEFAULTS } from '../../src/config.mjs';

function tmpToml(content) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jm-cfg-')), 'config.toml');
  fs.writeFileSync(p, content);
  return p;
}

test('TOML 加载 + 默认值', () => {
  const cfg = loadConfig(tmpToml('dailyCreditCap = 300\n'), {});
  assert.equal(cfg.dailyCreditCap, 300);
  assert.equal(cfg.port, DEFAULTS.port);
});

test('env 覆盖优先于文件', () => {
  const cfg = loadConfig(tmpToml('dailyCreditCap = 300\n'), { JMAPI_DAILY_CREDIT_CAP: '700' });
  assert.equal(cfg.dailyCreditCap, 700);
});

test('积分帽 0 = 关闭且带启动警告标记', () => {
  assert.equal(loadConfig(tmpToml('dailyCreditCap = 0\n'), {}).capDisabledWarning, true);
  assert.equal(loadConfig(tmpToml(''), {}).capDisabledWarning, false);
});

test('非法配置拒绝（负例）', () => {
  assert.throws(() => loadConfig(tmpToml('dailyCreditCap = -5\n'), {}), /非法/);
  assert.throws(() => loadConfig(tmpToml('port = "abc"\n'), {}), /非法/);
});

test('key：env 优先，其次 secret 文件；皆无 → null（fail-closed 由入口执行）', () => {
  const p = tmpToml('');
  fs.writeFileSync(p, '  file-key  ');
  assert.equal(loadApiKey({ JMAPI_API_KEY: 'env-key', JMAPI_API_KEY_FILE: p }), 'env-key');
  assert.equal(loadApiKey({ JMAPI_API_KEY_FILE: p }), 'file-key');
  assert.equal(loadApiKey({}), null);
});