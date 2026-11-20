import fs from 'node:fs';
import { parse } from 'smol-toml';

export const DEFAULTS = {
  dailyCreditCap: 500,
  rateLimitPerMin: 60,
  maxConcurrent: 4,
  maxBodyBytes: 10 * 1024 * 1024,
  fileUrlTtlSeconds: 3600,
  // 双栈监听：pasta 等转发器把宿主 v6 指向容器 v6 socket，仅 0.0.0.0 会致 v6 reset（实测）
  bind: '::',
  port: 8080,
  adminBind: '127.0.0.1',
  adminPort: 8081,
};

const ENV_MAP = {
  JMAPI_DAILY_CREDIT_CAP: 'dailyCreditCap',
  JMAPI_RATE_LIMIT_PER_MIN: 'rateLimitPerMin',
  JMAPI_MAX_CONCURRENT: 'maxConcurrent',
  JMAPI_MAX_BODY_BYTES: 'maxBodyBytes',
  JMAPI_FILE_URL_TTL_SECONDS: 'fileUrlTtlSeconds',
  JMAPI_BIND: 'bind',
  JMAPI_PORT: 'port',
  JMAPI_ADMIN_BIND: 'adminBind',
  JMAPI_ADMIN_PORT: 'adminPort',
};

export function loadConfig(path, env = process.env) {
  let file = {};
  if (path && fs.existsSync(path)) file = parse(fs.readFileSync(path, 'utf8'));
  const cfg = { ...DEFAULTS, ...file };
  for (const [envKey, cfgKey] of Object.entries(ENV_MAP)) {
    if (env[envKey] !== undefined && env[envKey] !== '') {
      cfg[cfgKey] = typeof DEFAULTS[cfgKey] === 'number' ? Number(env[envKey]) : env[envKey];
    }
  }
  for (const key of ['dailyCreditCap', 'rateLimitPerMin', 'maxConcurrent', 'maxBodyBytes', 'fileUrlTtlSeconds', 'port', 'adminPort']) {
    if (!Number.isFinite(cfg[key]) || cfg[key] < 0) throw new Error(`配置项 ${key} 非法：${cfg[key]}`);
  }
  cfg.capDisabledWarning = cfg.dailyCreditCap === 0;
  return cfg;
}

export function loadApiKey(env = process.env) {
  if (env.JMAPI_API_KEY) return env.JMAPI_API_KEY;
  if (env.JMAPI_API_KEY_FILE) return fs.readFileSync(env.JMAPI_API_KEY_FILE, 'utf8').trim();
  return null;
}