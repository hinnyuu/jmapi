import fs from 'node:fs';
import path from 'node:path';
import { sendJson, openaiError } from '../server.mjs';
import { signedFileUrl } from '../files.mjs';
import { contentTypeFor } from '../files.mjs';

// OpenAI /v1/audio/speech 形状 ↔ qwen_tts；voice 参数接受但忽略（qwen_tts 无音色控制，文档写明）
export async function handleAudio(req, res, ctx, pathname, body) {
  if (req.method === 'POST' && pathname === '/v1/audio/speech') {
    const cap = ctx.config.dailyCreditCap;
    if (cap > 0 && ctx.jobs.todayCredits() >= cap) {
      return sendJson(res, 429, openaiError('credit_cap_exceeded', '今日积分达上限', 'rate_limit_error'));
    }
    const { model, input } = body || {};
    if (typeof input !== 'string' || !input) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'input 必填且为非空字符串'));
    }
    const useModel = model || 'qwen_tts';
    if (useModel !== 'qwen_tts') {
      return sendJson(res, 400, openaiError('unsupported_parameter', 'speech 端点仅支持 qwen_tts；音乐/音效用 /v1/audio/generations'));
    }
    const job = ctx.jobs.create({ kind: 'audio', model: useModel });
    const env = await ctx.execCli(ctx.fetcher.binary, ['generate-audio', '--model', useModel, '--prompt', input,
      '--wait', String(ctx.config.imageWaitSeconds), '--out', path.join(ctx.outputDir, job.id) + '/'],
    { timeoutMs: (ctx.config.imageWaitSeconds + 30) * 1000 });
    if (env.status === 'success' && env.data?.completed) {
      const outputs = (env.data.audios || []).filter((a) => a.output_path)
        .map((a) => ({ name: path.basename(a.output_path), path: a.output_path, assetId: a.assetId || null }));
      ctx.jobs.update(job.id, { status: 'completed', credits: env.data.credits?.deducted ?? 0, outputs });
      if (!outputs.length) return sendJson(res, 502, openaiError('upstream_error', '上游未返回音频产物'));
      const abs = outputs[0].path;
      res.writeHead(200, { 'Content-Type': contentTypeFor(outputs[0].name), 'Content-Length': fs.statSync(abs).size });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    if (env.status === 'running') {
      return sendJson(res, 504, openaiError('generation_timeout', `音频未在限时内完成；轮询 GET /v1/jobs/${job.id}`, 'server_error', job.id));
    }
    return sendJson(res, 502, openaiError('upstream_error', env.error?.message || 'audio failed'));
  }

  // 扩展端点：seed_audio 音乐/音效（OpenAI 无对应面，文档标明扩展）
  if (req.method === 'POST' && pathname === '/v1/audio/generations') {
    const cap = ctx.config.dailyCreditCap;
    if (cap > 0 && ctx.jobs.todayCredits() >= cap) {
      return sendJson(res, 429, openaiError('credit_cap_exceeded', '今日积分达上限', 'rate_limit_error'));
    }
    const { model, prompt, sample_rate } = body || {};
    if (typeof prompt !== 'string' || !prompt) {
      return sendJson(res, 400, openaiError('invalid_request_error', 'prompt 必填'));
    }
    const useModel = model || 'seed_audio';
    if (useModel !== 'seed_audio') {
      return sendJson(res, 400, openaiError('unsupported_parameter', 'generations 端点仅支持 seed_audio'));
    }
    const job = ctx.jobs.create({ kind: 'audio', model: useModel });
    const args = ['generate-audio', '--model', useModel, '--prompt', prompt,
      '--wait', String(ctx.config.imageWaitSeconds), '--out', path.join(ctx.outputDir, job.id) + '/'];
    if (sample_rate !== undefined) args.push('--parameters', JSON.stringify({ sample_rate: String(sample_rate) }));
    const env = await ctx.execCli(ctx.fetcher.binary, args, { timeoutMs: (ctx.config.imageWaitSeconds + 30) * 1000 });
    if (env.status === 'success' && env.data?.completed) {
      const outputs = (env.data.audios || []).filter((a) => a.output_path)
        .map((a) => ({ name: path.basename(a.output_path), path: a.output_path, assetId: a.assetId || null }));
      const done = ctx.jobs.update(job.id, { status: 'completed', credits: env.data.credits?.deducted ?? 0, outputs });
      return sendJson(res, 200, {
        created: Math.floor(Date.now() / 1000),
        data: done.outputs.map((o) => ({
          url: signedFileUrl({ base: ctx.baseUrl, secret: ctx.apiKey, jobId: job.id, name: o.name, ttlSeconds: ctx.config.fileUrlTtlSeconds }),
        })),
      });
    }
    ctx.jobs.update(job.id, { status: 'failed', error: { code: env.error?.code, message: env.error?.message } });
    if (env.status === 'running') {
      return sendJson(res, 504, openaiError('generation_timeout', `音频未完成；轮询 GET /v1/jobs/${job.id}`, 'server_error', job.id));
    }
    return sendJson(res, 502, openaiError('upstream_error', env.error?.message || 'audio failed'));
  }

  return sendJson(res, 501, openaiError('not_implemented', `Endpoint ${pathname} not supported`));
}