import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { resolveSignedFile, contentTypeFor } from './files.mjs';
import { handleOpenAI } from './routes/openai.mjs';

export function redact(obj) {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = /authorization|token|cookie|secret|password|privatekey/i.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return obj;
}

export function makeLog(stream = process.stdout) {
  return (msg, fields = {}) => {
    stream.write(JSON.stringify({ ts: new Date().toISOString(), msg, ...redact(fields) }) + '\n');
  };
}

export function keyMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export function sendJson(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

export function openaiError(code, message, type = 'invalid_request_error', param = null) {
  return { error: { message, type, code, param } };
}

// OpenAI 真实 /v1/videos 接受 multipart（input_reference 上传），SDK 照发；须兼容纯字段 multipart
export function parseMultipart(buf, boundary) {
  const delim = Buffer.from('--' + boundary);
  const parts = [];
  let idx = buf.indexOf(delim);
  while (idx !== -1) {
    const start = idx + delim.length;
    if (buf.subarray(start, start + 2).toString() === '--') break;
    const next = buf.indexOf(delim, start);
    const segment = buf.subarray(start, next === -1 ? buf.length : next);
    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const headers = segment.subarray(2, headerEnd).toString();
    const body = segment.subarray(headerEnd + 4, Math.max(headerEnd + 4, segment.length - 2));
    parts.push({
      name: /name="([^"]+)"/.exec(headers)?.[1] || null,
      filename: /filename="([^"]*)"/.exec(headers)?.[1] ?? null,
      body,
    });
    idx = next;
  }
  return parts;
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > limit) {
        aborted = true;
        req.resume(); // drain 剩余 body，保持连接可回 413（destroy 会致客户端 fetch failed）
        reject(Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const buf = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      if (ct.startsWith('multipart/form-data')) {
        const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
        const b = boundary ? (boundary[1] || boundary[2]).trim() : null;
        if (!b) return reject(Object.assign(new Error('bad boundary'), { code: 'BAD_JSON' }));
        const parts = parseMultipart(buf, b);
        if (parts.some((p) => p.filename !== null)) {
          return reject(Object.assign(new Error('file parts unsupported'), { code: 'UNSUPPORTED_FILE' }));
        }
        const obj = {};
        for (const p of parts) if (p.name) obj[p.name] = p.body.toString('utf8');
        return resolve(obj);
      }
      try {
        resolve(JSON.parse(buf.toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

// per-key 分钟窗口限流 + 生成类全局并发闸（2H2G 宿主防 OOM；超限 429）
export function createGuards(config) {
  const windows = new Map();
  let inflight = 0;
  return {
    rateOk(key, now = Date.now()) {
      const w = windows.get(key);
      if (!w || now - w.start >= 60000) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      w.count += 1;
      return w.count <= config.rateLimitPerMin;
    },
    async acquire() {
      if (inflight >= config.maxConcurrent) return false;
      inflight += 1;
      return true;
    },
    release() { inflight = Math.max(0, inflight - 1); },
  };
}

export function createBusinessServer({ ctx }) {
  const guards = createGuards(ctx.config);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (p === '/healthz') return sendJson(res, 200, { status: 'ok' });
    if (p === '/readyz') {
      const st = ctx.fetcher.state;
      return sendJson(res, st.status === 'ready' ? 200 : 503, { status: st.status, message: st.message });
    }
    if (p.startsWith('/files/')) {
      const m = /^\/files\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(p);
      if (!m) return sendJson(res, 404, openaiError('not_found', 'bad file path'));
      const abs = resolveSignedFile({
        secret: ctx.apiKey, outputDir: ctx.outputDir, jobId: m[1], name: m[2],
        exp: url.searchParams.get('exp'), sig: url.searchParams.get('sig'),
      });
      if (!abs) return sendJson(res, 403, openaiError('invalid_signature', '签名无效/过期/路径非法', 'authentication_error'));
      res.writeHead(200, { 'Content-Type': contentTypeFor(m[2]), 'Content-Length': fs.statSync(abs).size });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    if (p.startsWith('/v1/') || p.startsWith('/api/')) {
      const key = bearer(req);
      if (!keyMatches(key, ctx.apiKey)) {
        return sendJson(res, 401, openaiError('invalid_api_key', 'Missing or invalid API key', 'authentication_error'));
      }
      if (ctx.fetcher.state.status !== 'ready') {
        return sendJson(res, 503, openaiError('service_not_ready', 'CLI runtime not ready yet', 'server_error'));
      }
      if (!guards.rateOk(key)) {
        return sendJson(res, 429, openaiError('rate_limit_exceeded', 'per-key 分钟限流', 'rate_limit_error'));
      }
      if (p.startsWith('/api/')) {
        return sendJson(res, 501, openaiError('not_implemented', 'DashScope face lands in M2'));
      }
      const isGeneration = req.method === 'POST' && (p === '/v1/images/generations' || p === '/v1/videos');
      if (isGeneration && !(await guards.acquire())) {
        return sendJson(res, 429, openaiError('concurrency_limit', '全局生成并发闸', 'rate_limit_error'));
      }
      try {
        let body = {};
        if (req.method === 'POST') {
          try {
            body = await readBody(req, ctx.config.maxBodyBytes);
          } catch (e) {
            if (e.code === 'BODY_TOO_LARGE') return sendJson(res, 413, openaiError('body_too_large', '请求体超上限'));
            if (e.code === 'UNSUPPORTED_FILE') return sendJson(res, 400, openaiError('unsupported_parameter', 'M1 不支持 multipart 文件部分（input_reference 留 M2+）'));
            return sendJson(res, 400, openaiError('invalid_json', '请求体须为 JSON 或纯字段 multipart'));
          }
        }
        const proto = req.headers['x-forwarded-proto'] || 'http';
        ctx.baseUrl = `${proto}://${req.headers.host}`;
        await handleOpenAI(req, res, ctx, p, body);
      } finally {
        if (isGeneration) guards.release();
      }
      return;
    }
    return sendJson(res, 404, openaiError('not_found', `Unknown path ${p}`));
  });
}

export function createAdminServer({ ctx }) {
  return http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://local').pathname;
    if (p === '/admin/status') {
      let login = null;
      if (ctx.fetcher.state.status === 'ready') {
        login = await ctx.execCli(ctx.fetcher.binary, ['status'], { timeoutMs: 30000 });
      }
      return sendJson(res, 200, {
        cli: ctx.fetcher.state,
        version: ctx.fetcher.meta?.version ?? null,
        login: login ? { status: login.status, data: login.data } : null,
        config: { dailyCreditCap: ctx.config.dailyCreditCap, capDisabledWarning: ctx.config.capDisabledWarning },
        creditsToday: ctx.jobs ? ctx.jobs.todayCredits() : null,
      });
    }
    return sendJson(res, 404, { error: { message: `Unknown admin path ${p}` } });
  });
}