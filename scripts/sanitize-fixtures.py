#!/usr/bin/env python3
"""把 live 录制的 CLI JSON 信封脱敏为契约 fixture：真实 id/账号字段替换为确定性假值。
用法：python3 scripts/sanitize-fixtures.py <raw目录> <fixture目录>
铁律：私有凭据永不入库；fixture 只保留结构与语义锚点（status/credits/字段形状）。"""
import json
import re
import sys
from pathlib import Path

SENSITIVE_KEYS = {
    'projectId', 'nodeId', 'thread_id', 'run_id', 'assetId', 'deviceCode', 'userCode',
    'sec_uid', 'avatar_url', 'account_scope', 'name',
}
FAKE_PREFIX = {
    'projectId': '900000000000', 'nodeId': '910000000000', 'assetId': '920000000000',
    'thread_id': 'canvas_thread_930000000000', 'run_id': '00000000-0000-4000-8000-00000000',
    'deviceCode': 'fake-device-code-', 'userCode': 'fake-user-code-',
}
RENAME = {'raw-status.json': 'status.json', 'raw-error.json': 'error.json', 'raw-running.json': 'query-completed.json'}


def collect(node, mapping, counters):
    if isinstance(node, dict):
        for k, v in node.items():
            if k in SENSITIVE_KEYS and isinstance(v, str) and v and v not in mapping:
                if k in FAKE_PREFIX:
                    counters[k] = counters.get(k, 0) + 1
                    mapping[v] = f"{FAKE_PREFIX[k]}{counters[k]:02d}"
                elif k == 'name':
                    mapping[v] = '测试用户'
                elif k == 'sec_uid':
                    mapping[v] = 'MS4wLjABAAAAFAKE'
                elif k == 'avatar_url':
                    mapping[v] = 'https://example.invalid/avatar.png'
                elif k == 'account_scope':
                    mapping[v] = 'fake-account-scope'
            collect(v, mapping, counters)
    elif isinstance(node, list):
        for v in node:
            collect(v, mapping, counters)


def scrub(node, mapping):
    if isinstance(node, dict):
        return {k: scrub(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [scrub(v, mapping) for v in node]
    if isinstance(node, str):
        out = node
        for raw, fake in sorted(mapping.items(), key=lambda kv: -len(kv[0])):
            out = out.replace(raw, fake)
        out = re.sub(r'/root/[^"\s]*/out/', '/output/', out)
        out = out.replace('/root/projects/tests/temp/jimeng-test', '/workdir')
        return out
    return node


def main():
    raw_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted(raw_dir.glob('*.json')):
        doc = json.loads(src.read_text())
        mapping, counters = {}, {}
        collect(doc, mapping, counters)
        clean = scrub(doc, mapping)
        dst = out_dir / RENAME.get(src.name, src.name)
        dst.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + '\n')
        print(f'{src.name} -> {dst.name}（替换 {len(mapping)} 个敏感值）')


if __name__ == '__main__':
    main()