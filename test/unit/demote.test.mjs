import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseIdMap, computeDemotion } from '../../src/demote.mjs';

const ROOTLESS_MAP = parseIdMap('0 1000 1\n1 100000 65536\n');
const IDENTITY = parseIdMap('0 0 4294967295\n');
const rootOnly = process.getuid() === 0 ? test : test.skip;

test('uid_map 解析', () => {
  assert.deepEqual(ROOTLESS_MAP[0], { inside: 0, outside: 1000, count: 1 });
  assert.equal(ROOTLESS_MAP.length, 2);
});

test('rootless：容器侧属主即降权目标（dev 属主 bind → 容器 0）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-demote-'));
  const st = fs.statSync(dir);
  const t = computeDemotion({ stateDir: dir, euid: 0, uidMap: ROOTLESS_MAP, gidMap: ROOTLESS_MAP });
  assert.deepEqual(t, { uid: st.uid, gid: st.gid, chown: false });
  fs.rmSync(dir, { recursive: true, force: true });
});

rootOnly('rootless + 溢出属主 65534（宿主 root bind）→ EACCES 明确提示（负例）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-demote-'));
  fs.chownSync(dir, 65534, 65534);
  assert.throws(() => computeDemotion({ stateDir: dir, euid: 0, uidMap: ROOTLESS_MAP, gidMap: ROOTLESS_MAP }), /65534|SELinux/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rootful：非 root 属主直接降权；PUID/PGID 覆盖优先', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-demote-'));
  const st = fs.statSync(dir);
  const t = computeDemotion({ stateDir: dir, euid: 0, uidMap: IDENTITY, gidMap: IDENTITY });
  if (st.uid !== 0) assert.deepEqual(t, { uid: st.uid, gid: st.gid, chown: false });
  const o = computeDemotion({ stateDir: dir, euid: 0, uidMap: ROOTLESS_MAP, gidMap: ROOTLESS_MAP, puid: 1234, pgid: 1234 });
  assert.deepEqual(o, { uid: 1234, gid: 1234, chown: false });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('非 root 进程不降权', () => {
  assert.equal(computeDemotion({ stateDir: os.tmpdir(), euid: 1000, uidMap: IDENTITY, gidMap: IDENTITY }), null);
});

rootOnly('rootful + root 属主 → chown 1000 再降权', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-demote-'));
  const t = computeDemotion({ stateDir: dir, euid: 0, uidMap: IDENTITY, gidMap: IDENTITY });
  assert.deepEqual(t, { uid: 1000, gid: 1000, chown: true });
  fs.rmSync(dir, { recursive: true, force: true });
});