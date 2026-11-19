#!/usr/bin/env python3
# 门禁用例：在临时 git 仓库中逐案例调用 gate.py --local，断言退出码与输出关键词。
import os
import subprocess
import sys
import tempfile
from pathlib import Path

GATE = Path(__file__).resolve().parent / "gate.py"
PROJECT_ROOT = Path(__file__).resolve().parents[2]

HISTORY_ENTRY = """---
date: {date}
keywords: [{keywords}]
scope: [{scope}]
type: {type}
status: accepted
---

# {title}

{body}
"""


def fixture_files():
    files = {
        "README.md": "# jmapi 测试夹具\n\n中文说明。\n",
        "NOTICE": "# NOTICE\n\n许可边界说明。\n",
        "docs/project/impact-map.yaml": (
            PROJECT_ROOT / "docs/project/impact-map.yaml"
        ).read_text(encoding="utf-8"),
        "docs/project/status.md": "# 项目状态\n\n当前状态：初始化。\n",
        "docs/project/architecture.md": "# 架构\n\n模块划分说明。\n",
        "docs/project/gates.md": "# 门禁\n\n检查项说明。\n",
        "docs/project/conventions.md": "# 约定\n\n文档约定说明。\n",
        "docs/project/roadmap.md": "# 路线图\n\n阶段规划。\n",
        "docs/api.md": "# API\n\n接口说明。\n",
        "wiki/user/api.md": "# 用户 API 指南\n\n使用说明。\n",
        "wiki/deploy/quickstart.md": "# 快速部署\n\n部署步骤。\n",
        "history/2026-01-01-0900-baseline.md": HISTORY_ENTRY.format(
            date="2026-01-01T09:00:00+08:00",
            keywords="初始化",
            scope="project",
            type="decision",
            title="基线决策",
            body="初始化仓库。",
        ),
    }
    return files


def run_git(fx, *args):
    subprocess.run(["git", "-C", str(fx), *args], check=True, capture_output=True, text=True)


def run_gate(fx, *args, nochange=False):
    env = os.environ.copy()
    env.pop("JMAPI_DOCS_NOCHANGE", None)
    if nochange:
        env["JMAPI_DOCS_NOCHANGE"] = "true"
    proc = subprocess.run(
        [sys.executable, str(GATE), *args],
        cwd=fx,
        env=env,
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def setup_fixture(fx):
    for rel, content in fixture_files().items():
        f = fx / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(content, encoding="utf-8")
    run_git(fx, "init", "-q")
    # 合成仓库与宿主机全局配置隔离，避免钩子/签名干扰
    run_git(fx, "config", "user.name", "Gate Test")
    run_git(fx, "config", "user.email", "gate-test@example.invalid")
    run_git(fx, "config", "commit.gpgsign", "false")
    run_git(fx, "config", "core.hooksPath", "/dev/null")
    run_git(fx, "add", "-A")
    run_git(fx, "commit", "-q", "-m", "baseline")
    code, out = run_gate(fx, "--write-index")
    if code != 0:
        raise RuntimeError(f"夹具索引生成失败：{out}")
    run_git(fx, "add", "history/INDEX.md", "history/INDEX.json")
    run_git(fx, "commit", "-q", "-m", "index")


def reset_fixture(fx):
    run_git(fx, "reset", "-q", "--hard", "HEAD")
    run_git(fx, "clean", "-qfd")


def write(fx, rel, content):
    f = fx / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(content, encoding="utf-8")


def append(fx, rel, content):
    with (fx / rel).open("a", encoding="utf-8") as fh:
        fh.write(content)


def case_unregistered(fx):
    write(fx, "random/unknown.txt", "x\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "FAIL" in out and "覆盖率" in out and "random/unknown.txt" in out, out


def case_missing_docs(fx):
    write(fx, "src/app.js", "console.log(1);\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "漏改" in out and "docs/api.md" in out, out


def case_nochange_exempt(fx):
    write(fx, "src/app.js", "console.log(1);\n")
    code, out = run_gate(fx, "--local", nochange=True)
    return code == 0 and "豁免" in out and "FAIL" not in out, out


def case_bad_link(fx):
    append(fx, "docs/project/status.md", "\n[坏链接](missing-file.md)\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "链接" in out and "missing-file.md" in out, out


def case_bad_anchor(fx):
    append(fx, "docs/project/status.md", "\n[锚点](architecture.md#no-such-anchor)\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "锚点" in out, out


def case_english_only(fx):
    write(fx, "docs/english-only.md", "# English Only\n\nNo Chinese here.\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "中文" in out and "english-only.md" in out, out


def case_forbidden(fx):
    write(fx, "server.key", "secret\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "禁入" in out and "server.key" in out, out


def case_status_stale(fx):
    write(fx, "src/app.js", "console.log(1);\n")
    for rel in ("docs/project/architecture.md", "docs/api.md", "wiki/user/api.md"):
        append(fx, rel, "\n补充说明。\n")
    code, out = run_gate(fx, "--local")
    return code == 1 and "status" in out and "docs/project/status.md" in out, out


def case_index_drift(fx):
    append(fx, "history/INDEX.md", "手改漂移\n")
    code1, out1 = run_gate(fx, "--local")
    code2, out2 = run_gate(fx, "--write-index")
    code3, out3 = run_gate(fx, "--local")
    ok = (
        code1 == 1 and "索引" in out1
        and code2 == 0
        and code3 == 0 and "FAIL" not in out3
    )
    return ok, out1 + out2 + out3


def case_frontmatter_missing_key(fx):
    write(
        fx,
        "history/2026-02-01-1000-missing.md",
        "---\ndate: 2026-02-01T10:00:00+08:00\nscope: [project]\ntype: change\nstatus: accepted\n---\n\n# 缺键记录\n\n正文。\n",
    )
    code, out = run_gate(fx, "--local")
    return code == 1 and "frontmatter" in out and "keywords" in out, out


def case_all_green(fx):
    write(fx, "src/app.js", "console.log(1);\n")
    for rel in (
        "docs/project/architecture.md",
        "docs/api.md",
        "wiki/user/api.md",
        "docs/project/status.md",
    ):
        append(fx, rel, "\n更新说明。\n")
    write(
        fx,
        "history/2026-02-02-1100-src-change.md",
        HISTORY_ENTRY.format(
            date="2026-02-02T11:00:00+08:00",
            keywords="源码, 变更",
            scope="src, docs",
            type="change",
            title="源码变更记录",
            body="新增入口脚本。",
        ),
    )
    code_w, out_w = run_gate(fx, "--write-index")
    code, out = run_gate(fx, "--local")
    return code_w == 0 and code == 0 and "FAIL" not in out, out_w + out


CASES = [
    ("未登记文件覆盖率红", case_unregistered),
    ("漏改红", case_missing_docs),
    ("JMAPI_DOCS_NOCHANGE 豁免绿", case_nochange_exempt),
    ("坏链接红", case_bad_link),
    ("坏锚点红", case_bad_anchor),
    ("纯英文 docs 红", case_english_only),
    ("禁入文件红", case_forbidden),
    ("src 改动未更新 status 红", case_status_stale),
    ("索引漂移红 + --write-index 后绿", case_index_drift),
    ("frontmatter 缺键红", case_frontmatter_missing_key),
    ("全合规绿", case_all_green),
]


def main():
    passed, failed = 0, 0
    with tempfile.TemporaryDirectory(prefix="docs-gate-test-") as td:
        fx = Path(td) / "repo"
        fx.mkdir()
        setup_fixture(fx)
        for name, fn in CASES:
            reset_fixture(fx)
            try:
                ok, out = fn(fx)
            except Exception as e:
                ok, out = False, f"用例异常：{e}"
            if ok:
                passed += 1
                print(f"PASS 用例：{name}")
            else:
                failed += 1
                print(f"FAIL 用例：{name}")
                print("---- gate 输出 ----")
                print(out.rstrip())
                print("-------------------")
    print(f"汇总：共 {len(CASES)} 例，通过 {passed}，失败 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())