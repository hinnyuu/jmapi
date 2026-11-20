import fs from 'node:fs';
import path from 'node:path';
import { sendJson, openaiError } from '../server.mjs';
import { signedFileUrl } from '../files.mjs';

// script 命令须目录绑定画布：门面维护隐藏绑定目录 state/script（首次调用 init）
async function ensureScriptProject(ctx) {
  const cfg = path.join(ctx.scriptDir, '.jimeng', 'config.json');
  if (fs.existsSync(cfg)) return true;
  fs.mkdirSync(ctx.scriptDir, { recursive: true });
  const env = await ctx.execCli(ctx.fetcher.binary, ['init', '--title', 'jmapi-facade'], { cwd: ctx.scriptDir });
  return env.status === 'success';
}

export async function handleScript(req, res, ctx, pathname, body) {
  const m = /^\/v1\/script\/(outline|episode)$/.exec(pathname);
  if (req.method !== 'POST' || !m) {
    return sendJson(res, 501, openaiError('not_implemented', `Endpoint ${pathname} not supported`));
  }
  const cap = ctx.config.dailyCreditCap;
  if (cap > 0 && ctx.jobs.todayCredits() >= cap) {
    return sendJson(res, 429, openaiError('credit_cap_exceeded', '今日积分达上限', 'rate_limit_error'));
  }
  if (!(await ensureScriptProject(ctx))) {
    return sendJson(res, 502, openaiError('upstream_error', '隐藏画布绑定初始化失败'));
  }
  const b = body || {};
  const args = ['script', m[1]];
  if (m[1] === 'outline') {
    if (!Number.isInteger(b.episode_num) || b.episode_num < 1 || b.episode_num > 100) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'episode_num 须 1-100 整数'));
    }
    if (typeof b.idea !== 'string' || !b.idea) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'idea 必填'));
    }
    args.push('--episode-num', String(b.episode_num), '--idea', b.idea);
    if (b.ref_content) args.push('--ref-content', String(b.ref_content));
  } else {
    for (const k of ['characters', 'current_episode', 'current_episode_summary']) {
      if (b[k] === undefined || b[k] === '') return sendJson(res, 400, openaiError('invalid_request_error', `${k} 必填`));
    }
    args.push('--characters', String(b.characters), '--current-episode', String(b.current_episode),
      '--current-episode-summary', String(b.current_episode_summary));
    if (b.history_summary) args.push('--history-summary', String(b.history_summary));
    if (b.future_summary) args.push('--future-summary', String(b.future_summary));
  }
  if (b.model_key) args.push('--model-key', String(b.model_key));
  const job = ctx.jobs.create({ kind: 'script', model: b.model_key || 'script_bird' });
  args.push('--out', path.join(ctx.outputDir, job.id) + '/');
  const env = await ctx.execCli(ctx.fetcher.binary, args, { cwd: ctx.scriptDir });
  if (env.status === 'success' && env.data?.thread_id) {
    const done = env.data.completed
      ? ctx.jobs.update(job.id, {
        status: 'completed', credits: env.data.credits?.deducted ?? 0,
        outputs: env.data.localPath ? [{ name: path.basename(env.data.localPath), path: env.data.localPath, assetId: null }] : [],
      })
      : ctx.jobs.update(job.id, { status: 'in_progress', thread_id: env.data.thread_id, run_id: env.data.run_id });
    return sendJson(res, 200, {
      id: job.id, object: 'script', kind: m[1], status: done.status,
      outputs: done.outputs.map((o) => ({
        url: signedFileUrl({ base: ctx.baseUrl, secret: ctx.apiKey, jobId: job.id, name: o.name, ttlSeconds: ctx.config.fileUrlTtlSeconds }),
      })),
    });
  }
  ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
  return sendJson(res, 502, openaiError('upstream_error', env.error?.message || 'script submit failed'));
}