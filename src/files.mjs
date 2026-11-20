import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NAME_RE = /^[A-Za-z0-9._-]+$/;

export function signUrl(secret, jobId, name, exp) {
  return crypto.createHmac('sha256', secret).update(`${jobId}/${name}/${exp}`).digest('hex');
}

export function signedFileUrl({ base, secret, jobId, name, ttlSeconds }) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signUrl(secret, jobId, name, exp);
  return `${base}/files/${jobId}/${name}?exp=${exp}&sig=${sig}`;
}

// 校验签名+有效期+文件名白名单+路径防穿越；返回绝对路径或 null
export function resolveSignedFile({ secret, outputDir, jobId, name, exp, sig, now = Date.now() }) {
  if (!NAME_RE.test(name) || !NAME_RE.test(jobId)) return null;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < now) return null;
  const expect = signUrl(secret, jobId, name, expNum);
  const a = Buffer.from(String(sig || ''));
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const abs = path.resolve(outputDir, jobId, name);
  if (!abs.startsWith(path.resolve(outputDir) + path.sep)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

export function contentTypeFor(name) {
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}