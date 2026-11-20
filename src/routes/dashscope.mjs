import path from 'node:path';
import { sendJson } from '../server.mjs';
import { signedFileUrl } from '../files.mjs';
import { ratioFromSize } from './openai.mjs';

function dsError(res, code, message, http = 400) {
  return sendJson(res, http, { code, message, request_id: null });
}

const DS_STATUS = { queued: 'PENDING', in_progress: 'RUNNING', completed: 'SUCCEEDED', failed: 'FAILED' };

function taskOutput(ctx, job) {
  const out = { task_id: job.id, task_status: DS_STATUS[job.status] || job.status };
  if (job.status === 'completed') {
    out.results = job.outputs.map((o) => ({
      url: signedFileUrl({ base: ctx.baseUrl, secret: ctx.apiKey, jobId: job.id, name: o.name, ttlSeconds: ctx.config.fileUrlTtlSeconds }),
    }));
  }
  if (job.status === 'failed') out.message = job.error?.message || 'failed';
  return out;
}

async function pollIfNeeded(ctx, job) {
  if (job.kind === 'video' && (job.status === 'queued' || job.status === 'in_progress')) {
    const env = await ctx.execCli(ctx.fetcher.binary, ['query-result', '--thread-id', job.thread_id, '--run-id', job.run_id,
      '--out', path.join(ctx.outputDir, job.id) + '/']);
    if (env.status === 'success' && env.data?.completed) {
      return ctx.jobs.update(job.id, {
        status: 'completed', credits: env.data.credits?.deducted ?? 0,
        outputs: (env.data.videos || []).filter((v) => v.output_path).map((v) => ({ name: path.basename(v.output_path), path: v.output_path, assetId: v.assetId || null })),
      });
    }
    if (env.status === 'error') return ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    return ctx.jobs.update(job.id, { status: 'in_progress' });
  }
  if (job.kind === 'script' && (job.status === 'queued' || job.status === 'in_progress')) {
    const env = await ctx.execCli(ctx.fetcher.binary, ['script', 'result', '--thread-id', job.thread_id, '--run-id', job.run_id,
      '--out', path.join(ctx.outputDir, job.id) + '/'], { cwd: ctx.scriptDir });
    if (env.status === 'success' && env.data?.completed) {
      return ctx.jobs.update(job.id, {
        status: 'completed', credits: env.data.credits?.deducted ?? 0,
        outputs: env.data.localPath ? [{ name: path.basename(env.data.localPath), path: env.data.localPath, assetId: null }] : [],
      });
    }
    if (env.status === 'error') return ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    return ctx.jobs.update(job.id, { status: 'in_progress' });
  }
  return job;
}

export async function handleDashScope(req, res, ctx, pathname, body) {
  const taskGet = /^\/api\/v1\/tasks\/([A-Za-z0-9-]+)$/.exec(pathname);
  if (req.method === 'GET' && taskGet) {
    const job = ctx.jobs.get(taskGet[1]);
    if (!job) return dsError(res, 'InvalidParameter', 'task 不存在', 404);
    const cur = await pollIfNeeded(ctx, job);
    return sendJson(res, 200, { output: taskOutput(ctx, cur), usage: { credits: cur.credits }, request_id: null });
  }

  const synth = /^\/api\/v1\/services\/aigc\/(text2image\/image-synthesis|video-generation\/video-synthesis)$/.exec(pathname);
  if (req.method === 'POST' && synth) {
    if ((req.headers['x-dashscope-async'] || '').toLowerCase() !== 'enable') {
      return dsError(res, 'InvalidParameter', '须携带 X-DashScope-Async: enable（本面仅异步任务形态）');
    }
    const cap = ctx.config.dailyCreditCap;
    if (cap > 0 && ctx.jobs.todayCredits() >= cap) {
      return dsError(res, 'Throttling.RateQuota', `今日积分达上限 ${cap}`, 429);
    }
    const { model, input, parameters } = body || {};
    const prompt = input?.prompt;
    if (typeof model !== 'string' || !model || typeof prompt !== 'string' || !prompt) {
      return dsError(res, 'InvalidParameter', 'model 与 input.prompt 必填');
    }
    const isVideo = synth[1].startsWith('video');
    const ratio = ratioFromSize(parameters?.size);
    if (!ratio) return dsError(res, 'InvalidParameter', `parameters.size 格式须为 WxH：${parameters?.size}`);
    const job = ctx.jobs.create({ kind: isVideo ? 'video' : 'image', model });
    const outArg = path.join(ctx.outputDir, job.id) + '/';
    let env;
    if (isVideo) {
      const duration = parameters?.duration === undefined ? 4 : Number(parameters.duration);
      if (!Number.isInteger(duration) || duration < 1 || duration > 15) return dsError(res, 'InvalidParameter', 'parameters.duration 须 1-15');
      env = await ctx.execCli(ctx.fetcher.binary, ['generate-video', '--model', model, '--prompt', prompt,
        '--duration', String(duration), '--ratio', ratio, '--out', outArg]);
      if (env.status === 'success' && env.data?.submissionStatus === 'submitted') {
        ctx.jobs.update(job.id, { status: 'in_progress', thread_id: env.data.thread_id, run_id: env.data.run_id });
      } else {
        ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
        return dsError(res, env.error?.code || 'InternalError', env.error?.message || 'submit failed', 502);
      }
    } else {
      env = await ctx.execCli(ctx.fetcher.binary, ['generate-image', '--model', model, '--prompt', prompt,
        '--ratio', ratio, '--wait', String(ctx.config.imageWaitSeconds), '--out', outArg],
      { timeoutMs: (ctx.config.imageWaitSeconds + 30) * 1000 });
      if (env.status === 'success' && env.data?.completed) {
        ctx.jobs.update(job.id, {
          status: 'completed', credits: env.data.credits?.deducted ?? 0,
          outputs: (env.data.images || []).filter((v) => v.output_path).map((v) => ({ name: path.basename(v.output_path), path: v.output_path, assetId: v.assetId || null })),
        });
      } else if (env.status === 'running') {
        ctx.jobs.update(job.id, { status: 'in_progress', thread_id: env.data?.thread_id, run_id: env.data?.run_id });
      } else {
        ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
        return dsError(res, env.error?.code || 'InternalError', env.error?.message || 'submit failed', 502);
      }
    }
    const cur = ctx.jobs.get(job.id);
    return sendJson(res, 200, { output: { task_id: job.id, task_status: DS_STATUS[cur.status] }, request_id: null });
  }

  return dsError(res, 'InvalidParameter', `未知 DashScope 路径 ${pathname}`, 404);
}