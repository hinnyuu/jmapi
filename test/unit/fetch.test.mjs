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

test('cache-first：无缓存不命中；meta+包+release 齐备且 sha 一致才命中', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-fetch-'));
  const state = path.join(dir, 'state');
  const f = new CliFetcher({ stateDir: state, env: {} });
  assert.equal(f.cacheHit(), false);
  const { outer, sha } = buildOuter(dir);
  fs.mkdirSync(path.join(state, 'cli'), { recursive: true });
  fs.copyFileSync(outer, path.join(state, 'cli', 'package.tar.gz'));
  const bundle = 'jimeng-novel-9.9.9-linux-amd64';
  fs.mkdirSync(path.join(state, 'cli', 'app', 'releases', bundle), { recursive: true });
  fs.writeFileSync(path.join(state, 'cli', 'app', 'releases', bundle, 'jimeng-novel'), 'x');
  fs.writeFileSync(path.join(state, 'cli', 'meta.json'), JSON.stringify({ bundle, innerSha: sha, version: '9.9.9' }));
  assert.equal(f.cacheHit(), true);
  fs.writeFileSync(path.join(state, 'cli', 'meta.json'), JSON.stringify({ bundle, innerSha: 'f'.repeat(64), version: '9.9.9' }));
  assert.equal(f.cacheHit(), false);
  fs.rmSync(dir, { recursive: true, force: true });
});