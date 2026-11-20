import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// CLI --out 目录须预先存在（CLI 不建目录，实测）；统一建目录防落盘失败
export function ensureOutDir(ctx, jobId) {
  const d = path.join(ctx.outputDir, jobId);
  fs.mkdirSync(d, { recursive: true });
  return d + '/';
}

// 落盘失败≠生成失败：上游已扣费完成，仅本地写路径问题，可重试（CLI hint 明示勿重提）
export function isWritePathError(env) {
  return env?.error?.code === 'COMMAND_FAILED' && /succeeded but cannot write/.test(env.error?.message || '');
}

// append-only JSONL ledger：单写者追加、启动重建索引（last-wins），崩溃安全、零 DB 依赖。
export class JobStore {
  constructor(dir, log = () => {}) {
    this.path = path.join(dir, 'jobs.jsonl');
    this.log = log;
    this.index = new Map();
    this.rebuild();
  }

  rebuild() {
    this.index.clear();
    if (!fs.existsSync(this.path)) return;
    for (const line of fs.readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec && rec.id) this.index.set(rec.id, rec);
      } catch {
        this.log('ledger skip corrupt line');
      }
    }
  }

  append(rec) {
    fs.appendFileSync(this.path, JSON.stringify(rec) + '\n');
    this.index.set(rec.id, rec);
    return rec;
  }

  create({ kind, model, thread_id = null, run_id = null }) {
    const now = new Date().toISOString();
    return this.append({
      id: crypto.randomUUID(), kind, model, thread_id, run_id,
      status: 'queued', credits: 0, day: null, outputs: [], error: null,
      createdAt: now, updatedAt: now,
    });
  }

  get(id) {
    return this.index.get(id) || null;
  }

  update(id, patch) {
    const cur = this.get(id);
    if (!cur) return null;
    const now = new Date().toISOString();
    const next = { ...cur, ...patch, id, updatedAt: now };
    if (patch.status === 'completed' || patch.status === 'failed') {
      next.day = now.slice(0, 10);
    }
    return this.append(next);
  }

  // UTC 日界已扣积分累计（积分帽执行依据；查询类不受限）
  todayCredits(now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    let sum = 0;
    for (const rec of this.index.values()) {
      if (rec.day === day) sum += rec.credits || 0;
    }
    return sum;
  }
}