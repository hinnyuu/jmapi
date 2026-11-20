#!/usr/bin/env node
// 契约测试假 CLI：按 argv 回放脱敏录制信封（test/fixtures），不触网不花积分。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const args = process.argv.slice(2).filter((a) => a !== '-j');
const read = (n) => fs.readFileSync(path.join(fixtures, n), 'utf8');
const [cmd, sub] = args;

let out;
if (cmd === 'status') out = read('status.json');
else if (cmd === 'model' && sub === 'describe') out = read('error.json');
else if (cmd === 'query-result') {
  out = process.env.FAKE_MODE === 'running'
    ? JSON.stringify({ context: { command: 'query-result' }, data: { completed: false, status: 'running' }, error: null, status: 'running' })
    : read('query-completed.json');
} else if (cmd === 'generate-image') out = read('image-result.json');
else if (cmd === 'generate-video') out = read('video-submit.json');
else if (cmd === 'generate-audio') out = read('tts-result.json');
else if (cmd === 'script') out = read('script-result.json');
else out = read('error.json');
process.stdout.write(out);