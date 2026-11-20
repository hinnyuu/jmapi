import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBusinessServer, createAdminServer } from '../../src/server.mjs';
import { JobStore } from '../../src/jobs.mjs';
import { DEFAULTS } from '../../src/config.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const read = (n) => JSON.parse(fs.readFileSync(path.join(fixtures, n), 'utf8'));

function fakeExec({ mode = 'ok' } = {}) {
  return async (binary, args) => {
    const outIdx = args.indexOf('--out');
    const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
    const rewrite = (env) => {
      if (!outDir) return env;
      const ext = { images: '.png', videos: '.mp4', audios: '.mp3' };
      for (const key of ['images', 'videos', 'audios']) {
        for (const item of env.data?.[key] || []) {
          // fixture 的 output_path 为脱敏绝对路径 /output/…：一律 rebase 到 outDir（CI 非 root 不可 mkdir /output）
          item.output_path = path.join(outDir, path.basename(item.output_path || `${item.assetId || 'asset'}${ext[key]}`));
          fs.mkdirSync(path.dirname(item.output_path), { recursive: true });
          fs.writeFileSync(item.output_path, 'fake-media-bytes');
        }
      }
      return env;
    };
    const [cmd, sub] = args;
    if (cmd === 'init') return { status: 'success', data: { projectId: '90000000000009' } };
    if (cmd === 'login') {
      return args.includes('--wait')
        ? { status: 'success', data: { status: 'logged_in', state: { loggedIn: true } } }
        : { status: 'success', data: { status: 'authorization_required', challenge: { deviceCode: 'dc-test', verificationUriComplete: 'https://example.invalid/auth' } } };
    }
    if (cmd === 'model' && sub === 'list') return { status: 'success', data: { models: [{ key: `m-${args[3]}`, kind: args[3] }] } };
    if (cmd === 'generate-image') return rewrite(read('image-result.json'));
    if (cmd === 'generate-video') return rewrite(read('video-submit.json'));
    if (cmd === 'generate-audio') return rewrite(read('tts-result.json'));
    if (cmd === 'script') {
      if ((mode === 'script-running' || mode === 'script-writefail') && sub !== 'result') {
        return { status: 'success', data: { thread_id: 't-s', run_id: 'r-s', completed: false } };
      }
      if (mode === 'script-writefail' && sub === 'result') {
        return { status: 'error', error: { code: 'COMMAND_FAILED', message: 'script succeeded but cannot write /output/x/: rename failed' } };
      }
      return read('script-result.json');
    }
    if (cmd === 'query-result') {
      if (mode === 'running') return { status: 'running', data: { completed: false, status: 'running' } };
      return rewrite(read('query-completed.json'));
    }
    return read('error.json');
  };
}

async function withServer(t, { config = {}, exec } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-m2-'));
  const ctx = {
    fetcher: { state: { status: 'ready' }, binary: '/fake', meta: { version: '1.0.9' }, env: {}, ensureReady: async () => {} },
    apiKey: 'test-key',
    config: { ...DEFAULTS, ...config },
    execCli: exec || fakeExec(),
    jobs: new JobStore(dir),
    outputDir: path.join(dir, 'out'),
    scriptDir: path.join(dir, 'script'),
    reloadConfig: () => {},
    baseUrl: 'http://local',
  };
  fs.mkdirSync(ctx.outputDir, { recursive: true });
  const srv = createBusinessServer({ ctx });
  const adm = createAdminServer({ ctx });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  await new Promise((r) => adm.listen(0, '127.0.0.1', r));
  t.after(() => { srv.close(); adm.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return {
    base: `http://127.0.0.1:${srv.address().port}`,
    admin: `http://127.0.0.1:${adm.address().port}`,
    H: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
    ctx,
  };
}

test('DashScope 图像异步任务：submit SUCCEEDED + task 查询 results', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST', headers: { ...H, 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({ model: 'seedream_5.0_flash', input: { prompt: 'cat' }, parameters: { size: '1792x1024' } }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.output.task_status, 'SUCCEEDED');
  const task = await fetch(`${base}/api/v1/tasks/${body.output.task_id}`, { headers: H });
  const tb = await task.json();
  assert.equal(tb.output.task_status, 'SUCCEEDED');
  assert.match(tb.output.results[0].url, /\/files\//);
});

test('DashScope 缺 async header → 400（负例）', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST', headers: H, body: JSON.stringify({ model: 'm', input: { prompt: 'p' } }),
  });
  assert.equal(res.status, 400);
});

test('DashScope 视频任务：PENDING/RUNNING → 查询 SUCCEEDED', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/api/v1/services/aigc/video-generation/video-synthesis', {
    method: 'POST', headers: { ...H, 'X-DashScope-Async': 'enable' },
    body: JSON.stringify({ model: 'Seedance_2.0_mini', input: { prompt: 'cat' }, parameters: { duration: 4, size: '854x480' } }),
  });
  assert.equal(res.status, 200);
  const id = (await res.json()).output.task_id;
  const task = await fetch(`${base}/api/v1/tasks/${id}`, { headers: H });
  assert.equal((await task.json()).output.task_status, 'SUCCEEDED');
});

test('audio speech：qwen_tts 流式 wav；voice 忽略；缺 input 400（负例）', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/v1/audio/speech', {
    method: 'POST', headers: H, body: JSON.stringify({ model: 'qwen_tts', input: '你好', voice: 'alloy' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/wav');
  assert.equal(await res.text(), 'fake-media-bytes');
  const bad = await fetch(base + '/v1/audio/speech', { method: 'POST', headers: H, body: JSON.stringify({ model: 'qwen_tts' }) });
  assert.equal(bad.status, 400);
});

test('audio generations：seed_audio 签名 URL；sample_rate 透传', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/v1/audio/generations', {
    method: 'POST', headers: H, body: JSON.stringify({ model: 'seed_audio', prompt: '钢琴雨声', sample_rate: 24000 }),
  });
  assert.equal(res.status, 200);
  assert.match((await res.json()).data[0].url, /\/files\//);
});

test('script outline：隐藏绑定 init + 完成态 outputs；缺 idea 400（负例）', async (t) => {
  const { base, H } = await withServer(t);
  const res = await fetch(base + '/v1/script/outline', {
    method: 'POST', headers: H, body: JSON.stringify({ episode_num: 3, idea: '橘猫雨夜归家' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.kind, 'outline');
  assert.equal(body.status, 'completed');
  const bad = await fetch(base + '/v1/script/outline', { method: 'POST', headers: H, body: JSON.stringify({ episode_num: 3 }) });
  assert.equal(bad.status, 400);
});

test('script 异步：submit running → /v1/jobs 轮询 settle completed（负例锚定）', async (t) => {
  const { base, H } = await withServer(t, { exec: fakeExec({ mode: 'script-running' }) });
  const res = await fetch(base + '/v1/script/outline', {
    method: 'POST', headers: H, body: JSON.stringify({ episode_num: 3, idea: '橘猫归家' }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'in_progress');
  const job = await fetch(`${base}/v1/jobs/${body.id}`, { headers: H });
  const jb = await job.json();
  assert.equal(jb.status, 'completed');
  assert.equal(jb.kind, 'script');
});

test('script 落盘失败≠生成失败：保持 in_progress+retryable（负例锚定）', async (t) => {
  const { base, H } = await withServer(t, { exec: fakeExec({ mode: 'script-writefail' }) });
  const res = await fetch(base + '/v1/script/outline', {
    method: 'POST', headers: H, body: JSON.stringify({ episode_num: 3, idea: '橘猫归家' }),
  });
  const body = await res.json();
  const job = await fetch(`${base}/v1/jobs/${body.id}`, { headers: H });
  const jb = await job.json();
  assert.equal(jb.status, 'in_progress');
  assert.equal(jb.error.retryable, true);
});

test('admin：login 挑战/wait logged_in/config reload/refresh', async (t) => {
  const { admin } = await withServer(t);
  const login = await fetch(admin + '/admin/login', { method: 'POST' });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).data.challenge.deviceCode, 'dc-test');
  const wait = await fetch(admin + '/admin/login/wait', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceCode: 'dc-test' }) });
  assert.equal((await wait.json()).data.status, 'logged_in');
  const reload = await fetch(admin + '/admin/config/reload', { method: 'POST' });
  assert.equal(reload.status, 200);
  const refresh = await fetch(admin + '/admin/cli/refresh', { method: 'POST' });
  assert.equal(refresh.status, 200);
  const noDc = await fetch(admin + '/admin/login/wait', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noDc.status, 400);
});