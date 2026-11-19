import { spawn } from 'node:child_process';

export function parseEnvelope(stdout) {
  const text = stdout.trim();
  const start = text.indexOf('{');
  if (start < 0) return { status: 'error', data: null, error: { code: 'NO_ENVELOPE', message: text.slice(0, 500) } };
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return { status: 'error', data: null, error: { code: 'BAD_ENVELOPE', message: text.slice(0, 500) } };
  }
}

// running（exit 0）是正常语义：超时未完成≠失败，调用方轮询，不自动重提。
export function execCli(binary, args, { timeoutMs = 600000, env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, [...args, '-j'], { env: { ...env, METRICS_LOG_LEVEL: 'none' } });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ status: 'error', data: null, error: { code: 'SPAWN_FAILED', message: String(e.message) } }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const envelope = parseEnvelope(out);
      resolve({ ...envelope, exitCode: code, stderr: err.slice(0, 2000) });
    });
  });
}