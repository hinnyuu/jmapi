import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, keyMatches, createBusinessServer, createAdminServer, openaiError } from '../../src/server.mjs';

test('日志脱敏：凭据类键一律 redacted（负例锚定）', () => {
  const out = redact({ authorization: 'Bearer x', token: 't', nested: { cookie: 'c', ok: 1 }, list: [{ secret: 's' }] });
  assert.equal(out.authorization, '[redacted]');
  assert.equal(out.nested.cookie, '[redacted]');
  assert.equal(out.nested.ok, 1);
  assert.equal(out.list[0].secret, '[redacted]');
});

test('key 比较：长度不等/值错 → false；正确 → true', () => {
  assert.equal(keyMatches('short', 'longer-key'), false);
  assert.equal(keyMatches('wrong-key-value', 'right-key-value'), false);
  assert.equal(keyMatches('same-key', 'same-key'), true);
  assert.equal(keyMatches(null, 'k'), false);
});

function ctx(state = 'ready') {
  return {
    fetcher: { state: { status: state, message: null }, binary: '/bin/true', meta: { version: '1.0.9' } },
    apiKey: 'test-key',
    config: { dailyCreditCap: 500, capDisabledWarning: false },
    execCli: async () => ({ status: 'success', data: { logged_in: false } }),
  };
}

async function withServer(t, state, fn) {
  const c = ctx(state);
  const srv = createBusinessServer({ ctx: c });
  const adm = createAdminServer({ ctx: c });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  await new Promise((r) => adm.listen(0, '127.0.0.1', r));
  t.after(() => { srv.close(); adm.close(); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const admin = `http://127.0.0.1:${adm.address().port}`;
  await fn(base, admin, c);
}

test('healthz 恒 200；readyz 就绪 200 / 未就绪 503', async (t) => {
  await withServer(t, 'fetching', async (base) => {
    assert.equal((await fetch(base + '/healthz')).status, 200);
    assert.equal((await fetch(base + '/readyz')).status, 503);
  });
  await withServer(t, 'ready', async (base) => {
    assert.equal((await fetch(base + '/readyz')).status, 200);
  });
});

test('认证与就绪门禁顺序：无 key 401 → 有 key 未就绪 503 → 就绪未实现 501 → 未知 404', async (t) => {
  await withServer(t, 'fetching', async (base) => {
    const noKey = await fetch(base + '/v1/models');
    assert.equal(noKey.status, 401);
    assert.equal((await noKey.json()).error.code, 'invalid_api_key');
    const withKey = await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer test-key' } });
    assert.equal(withKey.status, 503);
  });
  await withServer(t, 'ready', async (base) => {
    assert.equal((await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer test-key' } })).status, 501);
    assert.equal((await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(base + '/nope')).status, 404);
    assert.equal((await fetch(base + '/admin/status')).status, 404);
  });
});

test('admin 面只读状态，不含 key', async (t) => {
  await withServer(t, 'ready', async (_base, admin) => {
    const res = await fetch(admin + '/admin/status');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, '1.0.9');
    assert.equal(body.config.dailyCreditCap, 500);
    assert.ok(!JSON.stringify(body).includes('test-key'));
  });
});

test('默认 bind :: 双栈：IPv4 loopback 可达（pasta v6 转发锚定）', async (t) => {
  const c = ctx('ready');
  const srv = createBusinessServer({ ctx: c });
  const ok = await new Promise((resolve) => {
    srv.once('error', () => resolve(false));
    srv.listen(0, '::', () => resolve(true));
  });
  if (!ok) { t.skip('netns 无 IPv6'); return; }
  t.after(() => srv.close());
  const res = await fetch(`http://127.0.0.1:${srv.address().port}/healthz`);
  assert.equal(res.status, 200);
});

test('错误信封形状符合 OpenAI 约定', () => {
  const e = openaiError('invalid_api_key', 'msg', 'authentication_error');
  assert.deepEqual(Object.keys(e.error).sort(), ['code', 'message', 'param', 'type']);
});