import http from 'node:http';
import crypto from 'node:crypto';

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

function sendJson(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

export function openaiError(code, message, type = 'invalid_request_error', param = null) {
  return { error: { message, type, code, param } };
}

// M0：认证门禁 + 就绪门禁 + 未实现 501；生成路由 M1/M2 接入。
export function createBusinessServer({ ctx }) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (p === '/healthz') return sendJson(res, 200, { status: 'ok' });
    if (p === '/readyz') {
      const st = ctx.fetcher.state;
      return sendJson(res, st.status === 'ready' ? 200 : 503, { status: st.status, message: st.message });
    }
    if (p.startsWith('/v1/') || p.startsWith('/api/') || p.startsWith('/files/')) {
      if (!keyMatches(bearer(req), ctx.apiKey)) {
        return sendJson(res, 401, openaiError('invalid_api_key', 'Missing or invalid API key', 'authentication_error'));
      }
      if (ctx.fetcher.state.status !== 'ready') {
        return sendJson(res, 503, openaiError('service_not_ready', 'CLI runtime not ready yet', 'server_error'));
      }
      return sendJson(res, 501, openaiError('not_implemented', `Endpoint ${p} lands in M1/M2`, 'server_error'));
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
      });
    }
    return sendJson(res, 404, { error: { message: `Unknown admin path ${p}` } });
  });
}