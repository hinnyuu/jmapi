import fs from 'node:fs';
import path from 'node:path';
import { signedFileUrl } from '../files.mjs';
import { sendJson, openaiError } from '../server.mjs';

const RATIOS = [[16 / 9, '16:9'], [21 / 9, '21:9'], [9 / 16, '9:16'], [4 / 3, '4:3'], [3 / 4, '3:4'], [1, '1:1']];

export function ratioFromSize(size) {
  if (!size) return '16:9';
  const m = /^(\d+)x(\d+)$/.exec(String(size));
  if (!m) return null;
  const aspect = Number(m[1]) / Number(m[2]);
  let best = RATIOS[0];
  for (const r of RATIOS) {
    if (Math.abs(Math.log(aspect / r[0])) < Math.abs(Math.log(aspect / best[0]))) best = r;
  }
  return best[1];
}

export function mapCliError(res, envelope) {
  const err = envelope.error || {};
  const code = err.code || 'UPSTREAM_ERROR';
  const logId = err.details?.logId || err.details?.logid || null;
  if (/AUTH|CREDENTIAL|LOGIN/i.test(code)) {
    return sendJson(res, 502, openaiError('upstream_authentication_required',
      `即梦上游未登录或凭据失效（${code}）；管理员经 podman exec 执行 login${logId ? `；logId=${logId}` : ''}`, 'server_error'));
  }
  if (code === 'INVALID_ARGUMENT') {
    return sendJson(res, 400, openaiError('invalid_request_error', err.message || code, 'invalid_request_error'));
  }
  return sendJson(res, 502, openaiError('upstream_error', `${err.message || code}${logId ? `；logId=${logId}` : ''}`, 'server_error'));
}

function outputsFrom(data) {
  const out = [];
  for (const key of ['images', 'videos', 'audios']) {
    for (const item of data[key] || []) {
      if (item.output_path) out.push({ name: path.basename(item.output_path), path: item.output_path, assetId: item.assetId || null });
    }
  }
  return out;
}

function urlsFor(ctx, job) {
  return job.outputs.map((o) => signedFileUrl({
    base: ctx.baseUrl, secret: ctx.apiKey, jobId: job.id, name: o.name, ttlSeconds: ctx.config.fileUrlTtlSeconds,
  }));
}

function settle(ctx, job, data) {
  return ctx.jobs.update(job.id, {
    status: 'completed',
    credits: data.credits?.deducted ?? 0,
    outputs: outputsFrom(data),
    thread_id: data.thread_id || job.thread_id,
    run_id: data.run_id || job.run_id,
  });
}

const VIDEO_STATUS = { queued: 'queued', in_progress: 'in_progress', completed: 'completed', failed: 'failed' };

function videoObject(job) {
  return {
    id: job.id, object: 'video', model: job.model,
    status: VIDEO_STATUS[job.status] || job.status,
    created_at: Math.floor(new Date(job.createdAt).getTime() / 1000),
    error: job.error,
  };
}

async function pollVideo(ctx, job) {
  const env = await ctx.execCli(ctx.fetcher.binary, ['query-result', '--thread-id', job.thread_id, '--run-id', job.run_id,
    '--out', path.join(ctx.outputDir, job.id) + '/']);
  if (env.status === 'running') return ctx.jobs.update(job.id, { status: 'in_progress' });
  if (env.status === 'success' && env.data?.completed) return settle(ctx, job, env.data);
  if (env.status === 'error') {
    return ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
  }
  return job;
}

function capGuard(ctx, res) {
  const cap = ctx.config.dailyCreditCap;
  if (cap > 0 && ctx.jobs.todayCredits() >= cap) {
    sendJson(res, 429, openaiError('credit_cap_exceeded',
      `今日已扣积分 ${ctx.jobs.todayCredits()} 达到上限 ${cap}（UTC 日界）；查询不受限`, 'rate_limit_error'));
    return false;
  }
  return true;
}

export async function handleOpenAI(req, res, ctx, pathname, body) {
  const binary = ctx.fetcher.binary;
  if (req.method === 'GET' && pathname === '/v1/models') {
    const types = ['image', 'video', 'audio', 'text'];
    const envs = await Promise.all(types.map((t) => ctx.execCli(binary, ['model', 'list', '--type', t])));
    const bad = envs.find((e) => e.status === 'error');
    if (bad) return mapCliError(res, bad);
    const data = [];
    for (const e of envs) {
      for (const m of e.data?.models || []) data.push({ id: m.key, object: 'model', owned_by: 'jimeng', kind: m.kind });
    }
    return sendJson(res, 200, { object: 'list', data });
  }

  if (req.method === 'POST' && pathname === '/v1/images/generations') {
    if (!capGuard(ctx, res)) return;
    const { model, prompt, size, n, response_format } = body || {};
    if (typeof model !== 'string' || !model || typeof prompt !== 'string' || !prompt) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'model 与 prompt 必填且为非空字符串'));
    }
    if (response_format && response_format !== 'url') {
      return sendJson(res, 400, openaiError('unsupported_parameter', 'M1 仅支持 response_format=url'));
    }
    const ratio = ratioFromSize(size);
    if (!ratio) return sendJson(res, 400, openaiError('invalid_request_error', `size 格式须为 WxH：${size}`));
    const count = n === undefined ? 1 : Number(n);
    if (!Number.isInteger(count) || count < 1 || count > 4) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'n 须为 1-4 整数'));
    }
    const job = ctx.jobs.create({ kind: 'image', model });
    const args = ['generate-image', '--model', model, '--prompt', prompt, '--ratio', ratio,
      '--generate-image-count', String(count), '--wait', String(ctx.config.imageWaitSeconds),
      '--out', path.join(ctx.outputDir, job.id) + '/'];
    const env = await ctx.execCli(binary, args, { timeoutMs: (ctx.config.imageWaitSeconds + 30) * 1000 });
    if (env.status === 'success' && env.data?.completed) {
      const done = settle(ctx, job, env.data);
      return sendJson(res, 200, {
        created: Math.floor(Date.now() / 1000),
        data: urlsFor(ctx, done).map((url) => ({ url, revised_prompt: null })),
      });
    }
    if (env.status === 'running') {
      ctx.jobs.update(job.id, { status: 'in_progress', thread_id: env.data?.thread_id, run_id: env.data?.run_id });
      return sendJson(res, 504, openaiError('generation_timeout',
        `图片未在 ${ctx.config.imageWaitSeconds}s 内完成；任务未失败，轮询 GET /v1/jobs/${job.id}，勿重复提交`, 'server_error', job.id));
    }
    ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    return mapCliError(res, env);
  }

  if (req.method === 'POST' && pathname === '/v1/videos') {
    if (!capGuard(ctx, res)) return;
    const { model, prompt, seconds, size } = body || {};
    if (typeof model !== 'string' || !model || typeof prompt !== 'string' || !prompt) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'model 与 prompt 必填且为非空字符串'));
    }
    const ratio = ratioFromSize(size);
    if (!ratio) return sendJson(res, 400, openaiError('invalid_request_error', `size 格式须为 WxH：${size}`));
    const duration = seconds === undefined ? 4 : Number(seconds);
    if (!Number.isInteger(duration) || duration < 1 || duration > 15) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'seconds 须为 1-15 整数'));
    }
    const job = ctx.jobs.create({ kind: 'video', model });
    const env = await ctx.execCli(binary, ['generate-video', '--model', model, '--prompt', prompt,
      '--duration', String(duration), '--ratio', ratio, '--out', path.join(ctx.outputDir, job.id) + '/']);
    if (env.status === 'success' && env.data?.submissionStatus === 'submitted') {
      const upd = ctx.jobs.update(job.id, { status: 'in_progress', thread_id: env.data.thread_id, run_id: env.data.run_id });
      return sendJson(res, 200, { ...videoObject(upd), status: 'queued' });
    }
    ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    return mapCliError(res, env);
  }

  const videoGet = /^\/v1\/videos\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (req.method === 'GET' && videoGet) {
    const job = ctx.jobs.get(videoGet[1]);
    if (!job || job.kind !== 'video') return sendJson(res, 404, openaiError('not_found', 'video job 不存在'));
    const cur = (job.status === 'queued' || job.status === 'in_progress') ? await pollVideo(ctx, job) : job;
    return sendJson(res, 200, videoObject(cur));
  }

  const videoContent = /^\/v1\/videos\/([A-Za-z0-9-]+)\/content$/.exec(pathname);
  if (req.method === 'GET' && videoContent) {
    const job = ctx.jobs.get(videoContent[1]);
    if (!job || job.kind !== 'video') return sendJson(res, 404, openaiError('not_found', 'video job 不存在'));
    if (job.status !== 'completed' || !job.outputs.length) {
      return sendJson(res, 409, openaiError('not_ready', `video 状态 ${job.status}，完成后取 content`));
    }
    const abs = job.outputs[0].path;
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': fs.statSync(abs).size });
    fs.createReadStream(abs).pipe(res);
    return;
  }

  const jobGet = /^\/v1\/jobs\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (req.method === 'GET' && jobGet) {
    const job = ctx.jobs.get(jobGet[1]);
    if (!job) return sendJson(res, 404, openaiError('not_found', 'job 不存在'));
    const cur = (job.kind === 'video' && (job.status === 'queued' || job.status === 'in_progress')) ? await pollVideo(ctx, job) : job;
    return sendJson(res, 200, {
      id: cur.id, kind: cur.kind, status: cur.status, credits: cur.credits,
      outputs: urlsFor(ctx, cur), error: cur.error,
    });
  }

  return sendJson(res, 501, openaiError('not_implemented', `Endpoint ${pathname} lands in M2`));
}