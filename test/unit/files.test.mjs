import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signedFileUrl, resolveSignedFile, signUrl } from '../../src/files.mjs';
import { ratioFromSize } from '../../src/routes/openai.mjs';
import { createGuards } from '../../src/server.mjs';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-files-'));
  fs.mkdirSync(path.join(dir, 'job1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'job1', 'a.png'), 'x');
  return dir;
}

test('签名 URL 往返有效；篡改/过期/穿越皆拒（负例）', () => {
  const dir = setup();
  const url = signedFileUrl({ base: 'http://t', secret: 'k', jobId: 'job1', name: 'a.png', ttlSeconds: 60 });
  const u = new URL(url);
  const ok = resolveSignedFile({ secret: 'k', outputDir: dir, jobId: 'job1', name: 'a.png', exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') });
  assert.equal(ok, path.join(dir, 'job1', 'a.png'));
  assert.equal(resolveSignedFile({ secret: 'k', outputDir: dir, jobId: 'job1', name: 'a.png', exp: u.searchParams.get('exp'), sig: 'f'.repeat(64) }), null);
  assert.equal(resolveSignedFile({ secret: 'k', outputDir: dir, jobId: 'job1', name: 'a.png', exp: '1', sig: u.searchParams.get('sig') }), null);
  assert.equal(resolveSignedFile({ secret: 'k', outputDir: dir, jobId: 'job1', name: '../evil', exp: u.searchParams.get('exp'), sig: signUrl('k', 'job1', '../evil', Number(u.searchParams.get('exp'))) }), null);
  assert.equal(resolveSignedFile({ secret: 'wrong', outputDir: dir, jobId: 'job1', name: 'a.png', exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('size→ratio 最近匹配；非法格式 null（负例）', () => {
  assert.equal(ratioFromSize('1792x1024'), '16:9');
  assert.equal(ratioFromSize('1024x1792'), '9:16');
  assert.equal(ratioFromSize('1024x1024'), '1:1');
  assert.equal(ratioFromSize(undefined), '16:9');
  assert.equal(ratioFromSize('big'), null);
});

test('限流分钟窗口与并发闸（负例）', async () => {
  const g = createGuards({ rateLimitPerMin: 2, maxConcurrent: 1 });
  assert.equal(g.rateOk('k'), true);
  assert.equal(g.rateOk('k'), true);
  assert.equal(g.rateOk('k'), false);
  assert.equal(g.rateOk('other'), true);
  assert.equal(await g.acquire(), true);
  assert.equal(await g.acquire(), false);
  g.release();
  assert.equal(await g.acquire(), true);
});