import fs from 'node:fs';
import path from 'node:path';
import { computeDemotion, applyDemotion, parseIdMap } from './demote.mjs';
import { loadConfig, loadApiKey } from './config.mjs';
import { CliFetcher } from './fetch.mjs';
import { JobStore } from './jobs.mjs';
import { execCli } from './cli.mjs';
import { createBusinessServer, createAdminServer, makeLog } from './server.mjs';

const log = makeLog();

function fail(msg) {
  log('fatal', { message: msg });
  process.exit(1);
}

const stateDir = process.env.JMAPI_STATE_DIR || '/state';
const outputDir = process.env.JMAPI_OUTPUT_DIR || '/output';
const configPath = process.env.JMAPI_CONFIG || '/config/config.toml';

for (const d of [stateDir, outputDir]) fs.mkdirSync(d, { recursive: true });

// 降权须在读写 state 之前：bind 属主决定容器内身份。
if (process.getuid && process.getuid() === 0) {
  try {
    const target = computeDemotion({
      stateDir,
      euid: 0,
      uidMap: parseIdMap(fs.readFileSync('/proc/self/uid_map', 'utf8')),
      puid: process.env.PUID ? Number(process.env.PUID) : null,
      pgid: process.env.PGID ? Number(process.env.PGID) : null,
    });
    applyDemotion(target, [stateDir, outputDir]);
    log('demoted', { uid: process.getuid(), gid: process.getgid() });
  } catch (err) {
    fail(`降权失败：${err.message}`);
  }
}

const apiKey = loadApiKey();
if (!apiKey) fail('fail-closed：缺少 JMAPI_API_KEY（或 JMAPI_API_KEY_FILE）');
if (!process.env.JMAPI_CLI_SOURCE && !process.env.JMAPI_CLI_INSTALLER_FILE && !process.env.JMAPI_CLI_PACKAGE_FILE) {
  fail('fail-closed：缺少 JMAPI_CLI_SOURCE（或离线 JMAPI_CLI_INSTALLER_FILE/JMAPI_CLI_PACKAGE_FILE）');
}

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  fail(`配置加载失败：${err.message}`);
}
if (config.capDisabledWarning) log('warning', { message: 'dailyCreditCap=0：积分帽已关闭，公网暴露请自担风险' });

const fetcher = new CliFetcher({ stateDir, log });
const jobs = new JobStore(stateDir, log);
// CLI 凭据落 $HOME/.local/share/…：统一 HOME 到 state bind，否则容器重启丢登录态（实测缺陷）
const cliHome = path.join(stateDir, 'home');
fs.mkdirSync(cliHome, { recursive: true });
process.env.HOME = cliHome;
const ctx = { fetcher, apiKey, config, execCli, jobs, outputDir, baseUrl: 'http://local' };

const business = createBusinessServer({ ctx });
const admin = createAdminServer({ ctx });
// 无 IPv6 的 netns 回退 IPv4（边界校验：容器网络能力不可假设）
business.once('error', (err) => {
  if ((err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') && config.bind === '::') {
    log('warning', { message: `bind :: 失败（${err.code}），回退 0.0.0.0` });
    config.bind = '0.0.0.0';
    business.listen(config.port, config.bind, () => log('listening', { port: config.port, bind: config.bind }));
  } else {
    fail(`listen 失败：${err.message}`);
  }
});
business.listen(config.port, config.bind, () => log('listening', { port: config.port, bind: config.bind }));
admin.listen(config.adminPort, config.adminBind, () => log('listening', { port: config.adminPort, bind: config.adminBind, face: 'admin' }));

async function fetchLoop() {
  for (;;) {
    try {
      await fetcher.ensureReady();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 60000));
    }
  }
}
fetchLoop();

process.on('SIGHUP', () => {
  try {
    const next = loadConfig(configPath);
    Object.assign(config, next);
    log('config reloaded', { dailyCreditCap: config.dailyCreditCap });
    if (config.capDisabledWarning) log('warning', { message: 'dailyCreditCap=0：积分帽已关闭' });
  } catch (err) {
    log('config reload failed', { message: err.message });
  }
});

function shutdown(signal) {
  log('shutdown', { signal });
  business.close(() => admin.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => fail(`uncaught：${err.stack || err}`));