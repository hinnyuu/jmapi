import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readInnerFromOuter, CliFetcher } from '../../src/fetch.mjs';

// 合成 SCM 外层包：内层 tar.gz + checksums.txt，锚定完整性校验声称（含篡改负例）。
function buildOuter(dir, { tamper = false } = {}) {
  const bundle = 'jimeng-novel-9.9.9-linux-amd64';
  fs.mkdirSync(path.join(dir, bundle), { recursive: true });
  fs.writeFileSync(path.join(dir, bundle, 'jimeng-novel'), '#!/bin/sh\necho fake\n');
  const inner = path.join(dir, `${bundle}.tar.gz`);
  execFileSync('tar', ['-czf', inner, '-C', dir, bundle]);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(inner)).digest('hex');
  const checksums = path.join(dir, 'checksums.txt');
  fs.writeFileSync(checksums, `${tamper ? '0'.repeat(64) : sha}  ${bundle}.tar.gz\n`);
  const outer = path.join(dir, 'package.tar.gz');
  execFileSync('tar', ['-czf', outer, '-C', dir, `${bundle}.tar.gz`, 'checksums.txt']);
  return { outer, sha };
}

test('外层包解出内层并校验 sha256', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-fetch-'));
  const { outer, sha } = buildOuter(dir);
  const inner = readInnerFromOuter(outer);
  assert.equal(inner.sha, sha);
  assert.equal(inner.name, 'jimeng-novel-9.9.9-linux-amd64.tar.gz');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checksums 被篡改 → 拒绝（负例）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-fetch-'));
  const { outer } = buildOuter(dir, { tamper: true });
  assert.throws(() => readInnerFromOuter(outer), /SHA-256/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetch 期间事件循环不被阻塞（响应性锚定：旧 execFileSync 实现必红）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-fetch-'));
  const state = path.join(dir, 'state');
  const { outer } = buildOuter(dir);
  const installer = path.join(dir, 'slow-install.sh');
  fs.writeFileSync(installer, '#!/bin/sh\nsleep 1\nexit 0\n');
  fs.chmodSync(installer, 0o755);
  const f = new CliFetcher({ stateDir: state, env: { JMAPI_CLI_INSTALLER_FILE: installer, JMAPI_CLI_PACKAGE_FILE: outer } });
  let tick = false;
  setTimeout(() => { tick = true; }, 50);
  await f.ensureReady().catch(() => {});
  assert.equal(tick, true, 'fetch 子进程等待期间定时器须能触发（事件循环自由）');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cache-first：无缓存不命中；meta+包+release 齐备且 sha 一致才命中', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-fetch-'));
  const state = path.join(dir, 'state');
  const f = new CliFetcher({ stateDir: state, env: {} });
  assert.equal(f.cacheHit(), false);
  const { outer, sha } = buildOuter(dir);
  fs.mkdirSync(path.join(state, 'cli'), { recursive: true });
  fs.copyFileSync(outer, path.join(state, 'cli', 'package.tar.gz'));
  const bundle = 'jimeng-novel-9.9.9-linux-amd64';
  const release = `${bundle}-abcdef012345`;
  fs.mkdirSync(path.join(state, 'cli', 'app', 'releases', release), { recursive: true });
  fs.writeFileSync(path.join(state, 'cli', 'app', 'releases', release, 'jimeng-novel'), 'x');
  fs.writeFileSync(path.join(state, 'cli', 'meta.json'), JSON.stringify({ bundle, release, innerSha: sha, version: '9.9.9' }));
  assert.equal(f.cacheHit(), true);
  fs.writeFileSync(path.join(state, 'cli', 'meta.json'), JSON.stringify({ bundle, release, innerSha: 'f'.repeat(64), version: '9.9.9' }));
  assert.equal(f.cacheHit(), false);
  fs.rmSync(dir, { recursive: true, force: true });
});