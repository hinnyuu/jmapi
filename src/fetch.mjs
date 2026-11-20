import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';

const INNER_RE = /^jimeng-novel-([0-9.]+)-linux-amd64\.tar\.gz$/;

// 外层 SCM 包是 tar.gz：流式解出内层 linux-amd64 产物与 checksums.txt，不落盘全量解压。
export function readInnerFromOuter(outerPath) {
  const buf = zlib.gunzipSync(fs.readFileSync(outerPath));
  let off = 0;
  let inner = null;
  let checksums = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0+$/, '').replace(/^\.\//, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0+$/, '').trim() || '0', 8);
    const body = buf.subarray(off + 512, off + 512 + size);
    if (INNER_RE.test(name)) inner = { name, sha: crypto.createHash('sha256').update(body).digest('hex'), body };
    if (name === 'checksums.txt') checksums = body.toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  if (!inner || !checksums) throw new Error('发布包缺少 linux-amd64 产物或 checksums.txt');
  const expected = checksums.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2 && p[1] === inner.name).map((p) => p[0]);
  if (expected.length !== 1 || expected[0].toLowerCase() !== inner.sha) throw new Error('SHA-256 校验失败，拒绝使用发布包');
  return inner;
}

function grepPackageUrl(installerPath) {
  const text = fs.readFileSync(installerPath, 'utf8');
  const m = text.match(/^DEFAULT_PACKAGE_URL='(https:[^']+)'$/m);
  if (!m) throw new Error('无法从官方安装器解析 DEFAULT_PACKAGE_URL');
  return m[1];
}

// 异步子进程：execFileSync 会阻塞事件循环，fetch 期间 HTTP 与 SIGTERM 全死（实测缺陷）
function run(cmd, args, { env = process.env, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}: ${err.slice(0, 500)}`));
    });
  });
}

function curl(url, dest) {
  return run('curl', ['-q', '--fail', '--silent', '--show-error', '--location', '--proto', '=https',
    '--proto-redir', '=https', '--connect-timeout', '15', '--max-time', '300', '--retry', '2', url, '--output', dest]);
}

export class CliFetcher {
  constructor({ stateDir, env = process.env, log = () => {} }) {
    this.dir = path.join(stateDir, 'cli');
    this.env = env;
    this.log = log;
    this.metaPath = path.join(this.dir, 'meta.json');
    this.outerPath = path.join(this.dir, 'package.tar.gz');
    this.state = { status: 'fetching', message: null };
  }

  get binary() {
    return this.env.JMAPI_CLI_BIN || path.join(this.dir, 'bin', 'jimeng-novel');
  }

  cacheHit() {
    if (!fs.existsSync(this.metaPath) || !fs.existsSync(this.outerPath)) return false;
    const meta = JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
    if (!meta.release || !fs.existsSync(path.join(this.dir, 'app', 'releases', meta.release, 'jimeng-novel'))) return false;
    const inner = readInnerFromOuter(this.outerPath);
    if (inner.sha !== meta.innerSha) return false;
    this.meta = meta;
    return true;
  }

  async ensureReady() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (this.env.JMAPI_CLI_REFRESH !== '1' && this.cacheHit()) {
      this.log('cache hit', { version: this.meta.version });
      this.state = { status: 'ready', message: null };
      return;
    }
    this.log('fetch start');
    this.state = { status: 'fetching', message: null };
    const tmp = fs.mkdtempSync('/tmp/jmapi-fetch-');
    try {
      let installer = this.env.JMAPI_CLI_INSTALLER_FILE;
      if (!installer) {
        if (!this.env.JMAPI_CLI_SOURCE) throw new Error('缺少 JMAPI_CLI_SOURCE（或离线 JMAPI_CLI_INSTALLER_FILE/JMAPI_CLI_PACKAGE_FILE）');
        installer = path.join(tmp, 'install.sh');
        await curl(this.env.JMAPI_CLI_SOURCE, installer);
      }
      let outer = this.env.JMAPI_CLI_PACKAGE_FILE;
      if (!outer) {
        const url = this.env.JMAPI_CLI_PACKAGE_URL || grepPackageUrl(installer);
        outer = path.join(tmp, 'package.tar.gz');
        await curl(url, outer);
      }
      const inner = readInnerFromOuter(outer);
      if (this.env.JMAPI_CLI_SHA256 && this.env.JMAPI_CLI_SHA256.toLowerCase() !== inner.sha) {
        throw new Error('JMAPI_CLI_SHA256 钉版校验失败');
      }
      fs.copyFileSync(outer, this.outerPath);
      const bundle = inner.name.replace(/\.tar\.gz$/, '');
      await run('bash', [installer, '--package-file', this.outerPath,
        '--prefix', path.join(this.dir, 'app'), '--bin-dir', path.join(this.dir, 'bin'),
        '--skills-dir', path.join(this.dir, 'skills'), '--no-modify-path'],
      { env: { ...this.env, JIMENG_NOVEL_DISABLE_TELEMETRY: '1', METRICS_LOG_LEVEL: 'none' } });
      // 安装器 release 目录名带 sha12 后缀（<bundle>-<sha12>），以实际目录名入 meta
      const relRoot = path.join(this.dir, 'app', 'releases');
      const release = fs.existsSync(relRoot) ? fs.readdirSync(relRoot).find((n) => n.startsWith(`${bundle}-`)) : null;
      if (!release || !fs.existsSync(path.join(relRoot, release, 'jimeng-novel'))) {
        throw new Error('官方安装器未产出预期 release 目录');
      }
      this.meta = { version: inner.name.match(INNER_RE)?.[1] ?? 'unknown', bundle, release, innerSha: inner.sha, fetchedAt: new Date().toISOString() };
      fs.writeFileSync(this.metaPath, JSON.stringify(this.meta, null, 2));
      this.log('fetch done', { version: this.meta.version });
      this.state = { status: 'ready', message: null };
    } catch (err) {
      this.state = { status: 'error', message: String(err.message || err) };
      this.log('fetch error', { message: this.state.message });
      throw err;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}