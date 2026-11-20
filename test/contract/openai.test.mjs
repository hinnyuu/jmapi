import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBusinessServer } from '../../src/server.mjs';
import { JobStore } from '../../src/jobs.mjs';
import { DEFAULTS } from '../../src/config.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const read = (n) => JSON.parse(fs.readFileSync(path.join(fixtures, n), 'utf8'));

// 假 CLI：回放 fixture；--out 参数决定产物落盘路径（重写 output_path 到测试目录）
function fakeExec({ mode = 'ok', delay = 0 } = {}) {
  return async (binary, args) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const outIdx = args.indexOf('--out');
    const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
    const rewrite = (env) => {
      if (!outDir) return env;
      const ext = { images: '.png', videos: '.mp4', audios: '.mp3' };
      for (const key of ['images', 'videos', 'audios']) {
        for (const item of env.data?.[key] || []) {
          // 真 CLI 带 --out 时下载并补 output_path；录制 fixture 无 --out 故合成
          if (!item.output_path) item.output_path = path.join(outDir, `${item.assetId || 'asset'}${ext[key]}`);
        }
      }
      return env;
    };
    const [cmd, sub] = args;
    if (cmd === 'model' && sub === 'list') {
      if (mode === 'authfail') return { status: 'error', error: { code: 'AUTH_FAILED', message: 'not logged in' } };
      return { status: 'success', data: { models: [{ key: `m-${args[3]}`, kind: args[3] }] } };
    }
    if (cmd === 'generate-image') {
      if (mode === 'running') return { status: 'running', data: { completed: false, thread_id: 't1', run_id: 'r1' } };
      return rewrite(read('image-result.json'));
    }
    if (cmd === 'generate-video') return rewrite(read('video-submit.json'));
    if (cmd === 'query-result') {
      if (mode === 'running') return { status: 'running', data: { completed: false, status: 'running' } };
      return rewrite(read('query-completed.json'));
    }
    return read('error.json');
  };
}

async function withServer(t, { config = {}, exec } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-api-'));
  const ctx = {
    fetcher: { state: { status: 'ready' }, binary: '/fake', meta: { version: '1.0.9' } },
    apiKey: 'test-key',
    config: { ...DEFAULTS, ...config },
    execCli: exec || fakeExec(),
    jobs: new JobStore(dir),
    outputDir: path.join(dir, 'out'),
    baseUrl: 'http://local',
  };
  fs.mkdirSync(ctx.outputDir, { recursive: true });
  const srv = createBusinessServer({ ctx });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const H = { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' };
  return { base, H, ctx, dir };
}

test('models 列表合并四类型', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/v1/models', { headers: H });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.length, 4);
});

test('models 上游未登录 → 502 upstream_authentication_required（负例）', async (t) => {
  const { base, H } = await withServer(t, { exec: fakeExec({ mode: 'authfail' }) });
  const res = await fetch(base + '/v1/models', { headers: H });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'upstream_authentication_required');
});

test('images 同步完成 → 签名 URL 端到端可取文件', async (t) => {
  const { base, H, ctx } = await withServer(t);
  const res = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'seedream_5.0_flash', prompt: 'cat', size: '1792x1024' }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  const url = body.data[0].url;
  assert.match(url, /\/files\/[A-Za-z0-9-]+\/.+exp=\d+&sig=[a-f0-9]{64}/);
  const u = new URL(url);
  const jobId = u.pathname.split('/')[2];
  const name = u.pathname.split('/')[3];
  fs.mkdirSync(path.join(ctx.outputDir, jobId), { recursive: true });
  fs.writeFileSync(path.join(ctx.outputDir, jobId, name), 'pngbytes');
  const fileRes = await fetch(url);
  assert.equal(fileRes.status, 200);
  assert.equal(await fileRes.text(), 'pngbytes');
  const tampered = await fetch(url.replace(/sig=[a-f0-9]{64}/, 'sig=' + '0'.repeat(64)));
  assert.equal(tampered.status, 403);
});

test('images 超时 → 504 + job 可轮询（running 非失败，负例锚定）', async (t) => {
  const { base, H } = await withServer(t, { exec: fakeExec({ mode: 'running' }) });
  const res = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p' }) });
  assert.equal(res.status, 504);
  const jobId = (await res.json()).error.param;
  const job = await fetch(`${base}/v1/jobs/${jobId}`, { headers: H });
  assert.equal(job.status, 200);
  assert.equal((await job.json()).status, 'in_progress');
});

test('videos 异步：create queued → poll completed → content 流', async (t) => {
  const { base, H, ctx } = await withServer(t);
  const create = await fetch(base + '/v1/videos', { method: 'POST', headers: H, body: JSON.stringify({ model: 'Seedance_2.0_mini', prompt: 'cat', seconds: 4 }) });
  assert.equal(create.status, 200);
  const v = await create.json();
  assert.equal(v.status, 'queued');
  assert.equal(v.object, 'video');
  const poll = await fetch(`${base}/v1/videos/${v.id}`, { headers: H });
  assert.equal((await poll.json()).status, 'completed');
  const job = ctx.jobs.get(v.id);
  fs.mkdirSync(path.dirname(job.outputs[0].path), { recursive: true });
  fs.writeFileSync(job.outputs[0].path, 'mp4bytes');
  const content = await fetch(`${base}/v1/videos/${v.id}/content`, { headers: H });
  assert.equal(content.status, 200);
  assert.equal(content.headers.get('content-type'), 'video/mp4');
  assert.equal(await content.text(), 'mp4bytes');
});

test('videos 未完成取 content → 409（负例）', async (t) => {
  const { base, H } = await withServer(t, { exec: fakeExec({ mode: 'running' }) });
  const create = await fetch(base + '/v1/videos', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p' }) });
  const v = await create.json();
  const content = await fetch(`${base}/v1/videos/${v.id}/content`, { headers: H });
  assert.equal(content.status, 409);
});

test('积分帽：达上限拒绝新提交 429，查询不受限（负例）', async (t) => {
  const { base, H } = await withServer(t, { config: { dailyCreditCap: 3 } });
  const first = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p' }) });
  assert.equal(first.status, 200);
  const second = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p' }) });
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error.code, 'credit_cap_exceeded');
  const models = await fetch(base + '/v1/models', { headers: H });
  assert.equal(models.status, 200);
});

test('并发闸与限流（负例）', async (t) => {
  const { base, H } = await withServer(t, { config: { rateLimitPerMin: 10, maxConcurrent: 1 }, exec: fakeExec({ delay: 120 }) });
  const post = () => fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p' }) });
  const [a, b] = await Promise.all([post(), post()]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
});

test('body 上限与坏 JSON（负例）', async (t) => {
  const { base, H } = await withServer(t, { config: { rateLimitPerMin: 10, maxBodyBytes: 64 } });
  const big = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'x'.repeat(200) }) });
  assert.equal(big.status, 413);
  const bad = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: '{nope' });
  assert.equal(bad.status, 400);
});

test('参数校验负例：缺 prompt/坏 size/坏 n/坏 seconds', async (t) => {
  const { base, H } = await withServer(t);
  const cases = [
    { model: 'm' },
    { model: 'm', prompt: 'p', size: 'huge' },
    { model: 'm', prompt: 'p', n: 9 },
  ];
  for (const body of cases) {
    const res = await fetch(base + '/v1/images/generations', { method: 'POST', headers: H, body: JSON.stringify(body) });
    assert.equal(res.status, 400);
  }
  const v = await fetch(base + '/v1/videos', { method: 'POST', headers: H, body: JSON.stringify({ model: 'm', prompt: 'p', seconds: 99 }) });
  assert.equal(v.status, 400);
});