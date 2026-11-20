import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execCli, parseEnvelope } from '../../src/cli.mjs';

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'helpers', 'fake-cli.mjs');

test('信封透传：成功生图（credits/产物字段形状锚定）', async () => {
  const r = await execCli(fake, ['generate-image', '--model', 'seedream_5.0_flash']);
  assert.equal(r.status, 'success');
  assert.equal(r.exitCode, 0);
  assert.equal(r.data.completed, true);
  assert.equal(r.data.credits.deducted, 3);
  assert.ok(r.data.images[0].output_path.startsWith('/output/'));
});

test('视频提交返回 thread_id/run_id 句柄（异步任务表锚点）', async () => {
  const r = await execCli(fake, ['generate-video', '--model', 'Seedance_2.0_mini']);
  assert.equal(r.data.submissionStatus, 'submitted');
  assert.ok(r.data.thread_id && r.data.run_id);
});

test('running 语义：exit 0 + completed false，≠失败（负例锚定）', async () => {
  const r = await execCli(fake, ['query-result'], { env: { ...process.env, FAKE_MODE: 'running' } });
  assert.equal(r.exitCode, 0);
  assert.equal(r.status, 'running');
  assert.equal(r.data.completed, false);
});

test('错误信封保留 code/hint/合法参数（翻译层锚点）', async () => {
  const r = await execCli(fake, ['model', 'describe', '--model', 'nope']);
  assert.equal(r.status, 'error');
  assert.equal(r.error.code, 'INVALID_ARGUMENT');
  assert.ok(r.error.hint);
});

test('execCli HOME 覆盖（凭据落 state bind 锚定）', async () => {
  const r = await execCli(fake, ['home-probe'], { home: '/tmp/jm-home-anchor' });
  assert.equal(r.data.home, '/tmp/jm-home-anchor');
});

test('非 JSON stdout → NO_ENVELOPE 不崩溃（负例）', () => {
  assert.equal(parseEnvelope('plain text').error.code, 'NO_ENVELOPE');
  assert.equal(parseEnvelope('{broken').error.code, 'BAD_ENVELOPE');
});

test('二进制不存在 → SPAWN_FAILED 不崩溃（负例）', async () => {
  const r = await execCli('/nonexistent/jimeng-novel', ['status']);
  assert.equal(r.error.code, 'SPAWN_FAILED');
});