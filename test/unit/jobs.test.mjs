import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobStore } from '../../src/jobs.mjs';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jm-jobs-')); }

test('ledger append + 启动重建 last-wins', () => {
  const dir = tmp();
  const a = new JobStore(dir);
  const j = a.create({ kind: 'image', model: 'm' });
  a.update(j.id, { status: 'in_progress' });
  a.update(j.id, { status: 'completed', credits: 3 });
  const b = new JobStore(dir);
  assert.equal(b.get(j.id).status, 'completed');
  assert.equal(b.get(j.id).credits, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('损坏行跳过不崩溃（负例）', () => {
  const dir = tmp();
  const a = new JobStore(dir);
  const j = a.create({ kind: 'video', model: 'm' });
  fs.appendFileSync(path.join(dir, 'jobs.jsonl'), '{corrupt\n');
  const b = new JobStore(dir);
  assert.equal(b.get(j.id).kind, 'video');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('todayCredits 按 UTC 日界累计（跨日负例）', () => {
  const dir = tmp();
  const s = new JobStore(dir);
  const j1 = s.create({ kind: 'image', model: 'm' });
  s.update(j1.id, { status: 'completed', credits: 5 });
  const j2 = s.create({ kind: 'image', model: 'm' });
  s.update(j2.id, { status: 'completed', credits: 7 });
  assert.equal(s.todayCredits(), 12);
  const rec = s.get(j2.id);
  s.append({ ...rec, day: '2000-01-01' });
  assert.equal(s.todayCredits(), 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('update 不存在 id 返回 null（负例）', () => {
  const dir = tmp();
  const s = new JobStore(dir);
  assert.equal(s.update('nope', { status: 'failed' }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});