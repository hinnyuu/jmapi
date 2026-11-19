#!/usr/bin/env python3
# 文档门禁（clean-room 独立实现，MIT）。行为规格见 docs/project/gates.md。
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote

import yaml

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
HISTORY_NAME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9-]+\.md$")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")
ROOT_DOCS = ("README.md", "AGENTS.md", "SECURITY.md", "CONTRIBUTING.md")
FM_REQUIRED = ("date", "keywords", "scope", "type", "status")
FM_TYPES = {"decision", "change", "incident", "retirement"}
FM_STATUSES = {"accepted", "superseded"}
INDEX_NOTE = "> 由 scripts/docs-gate 从 frontmatter 生成（派生物，勿手改）。规则见 conventions.md。"


def git(root, *args):
    return subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, text=True, check=True
    ).stdout


@lru_cache(maxsize=None)
def glob_to_regex(pattern):
    # ** 跨目录、* 不跨 /；"**/" 额外允许匹配零层目录
    out = []
    i, n = 0, len(pattern)
    while i < n:
        c = pattern[i]
        if c == "*":
            if pattern[i : i + 3] == "**/":
                out.append("(?:.*/)?")
                i += 3
                continue
            if pattern[i : i + 2] == "**":
                out.append(".*")
                i += 2
                continue
            out.append("[^/]*")
            i += 1
            continue
        if c == "?":
            out.append("[^/]")
            i += 1
            continue
        out.append(re.escape(c))
        i += 1
    return re.compile("^" + "".join(out) + "$")


def glob_match(pattern, path):
    return glob_to_regex(pattern).match(path) is not None


def changed_files_local(root):
    # -uall 把未跟踪目录展开为文件，覆盖率须按文件判定
    entries = git(root, "status", "--porcelain", "-z", "-uall").split("\0")
    files = set()
    i = 0
    while i < len(entries):
        entry = entries[i]
        i += 1
        if not entry:
            continue
        status, path = entry[:2], entry[3:]
        files.add(path)
        # -z 模式下重命名/复制额外占一个 NUL 字段（旧路径），跳过
        if "R" in status or "C" in status:
            i += 1
    return files


def changed_files_ci(root, base):
    out = git(root, "diff", "--name-only", "-z", base, "HEAD")
    return {p for p in out.split("\0") if p}


def iter_md_lines(text):
    # 围栏代码块内的链接与标题是示例，不参与校验
    fence = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if fence is not None:
            if stripped.startswith(fence):
                fence = None
            continue
        if stripped.startswith("```") or stripped.startswith("~~~"):
            fence = stripped[:3]
            continue
        yield line


def heading_slugs(text):
    slugs = set()
    seen = {}
    for line in iter_md_lines(text):
        m = HEADING_RE.match(line)
        if not m:
            continue
        slug = re.sub(r"[^\w\- ]", "", m.group(1).lower()).replace(" ", "-")
        # GitHub 对重复标题追加 -1/-2 序号
        if slug in seen:
            seen[slug] += 1
            slug = f"{slug}-{seen[slug]}"
        else:
            seen[slug] = 0
        slugs.add(slug)
    return slugs


def scan_md_files(root, include_history=True):
    files = [root / name for name in ROOT_DOCS if (root / name).is_file()]
    dirs = ["docs", "wiki"] + (["history"] if include_history else [])
    for d in dirs:
        if (root / d).is_dir():
            files.extend(sorted((root / d).rglob("*.md")))
    return files


def check_links(root):
    problems = []
    slug_cache = {}
    for f in scan_md_files(root):
        rel = f.relative_to(root)
        for line in iter_md_lines(f.read_text(encoding="utf-8")):
            for m in LINK_RE.finditer(line):
                target = m.group(1)
                if re.match(r"^(https?://|mailto:)", target, re.IGNORECASE):
                    continue
                path_part, _, anchor = target.partition("#")
                path_part, anchor = unquote(path_part), unquote(anchor)
                if not path_part:
                    dest = f
                elif path_part.startswith("/"):
                    dest = root / path_part.lstrip("/")
                else:
                    dest = f.parent / path_part
                if not dest.exists():
                    problems.append(f"{rel}: 链接目标不存在 {target}")
                    continue
                if anchor and dest.suffix == ".md":
                    if dest not in slug_cache:
                        slug_cache[dest] = heading_slugs(dest.read_text(encoding="utf-8"))
                    if anchor not in slug_cache[dest]:
                        problems.append(f"{rel}: 锚点未命中 {target}")
    return problems


def check_chinese(root):
    problems = []
    for f in scan_md_files(root, include_history=False):
        if not CJK_RE.search(f.read_text(encoding="utf-8")):
            problems.append(f"{f.relative_to(root)}: 缺少中文内容")
    return problems


def check_forbidden(changed):
    problems = []
    for path in sorted(changed):
        base = path.rsplit("/", 1)[-1]
        parts = path.split("/")
        hit = (
            base == "devenv.md"
            or base.endswith((".key", ".pem"))
            or (base.startswith(".env") and base != ".env.example")
            or (base.endswith(".json") and "token" in base)
            or "secrets" in parts[:-1]
        )
        if hit:
            problems.append(path)
    return problems


def split_frontmatter(text):
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].strip() != "---":
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "".join(lines[1:i]), "".join(lines[i + 1 :])
    return None, text


def parse_aware_date(value):
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, date):
        return None
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None
    return dt if dt.tzinfo is not None else None


def check_frontmatter(root):
    problems = []
    hist = root / "history"
    if not hist.is_dir():
        return problems
    for f in sorted(hist.glob("*.md")):
        if f.name == "INDEX.md":
            continue
        rel = f.relative_to(root)
        if not HISTORY_NAME_RE.match(f.name):
            problems.append(f"{rel}: 文件名不符合 YYYY-MM-DD-HHMM-slug.md")
        fm_text, _ = split_frontmatter(f.read_text(encoding="utf-8"))
        if fm_text is None:
            problems.append(f"{rel}: 缺少 --- 包围的 frontmatter")
            continue
        try:
            fm = yaml.safe_load(fm_text)
        except yaml.YAMLError as e:
            problems.append(f"{rel}: frontmatter YAML 解析失败（{e}）")
            continue
        if not isinstance(fm, dict):
            problems.append(f"{rel}: frontmatter 不是映射")
            continue
        for key in FM_REQUIRED:
            if fm.get(key) is None:
                problems.append(f"{rel}: frontmatter 缺少 {key}")
        if fm.get("type") not in FM_TYPES:
            problems.append(f"{rel}: type 非法（{fm.get('type')}）")
        if fm.get("status") not in FM_STATUSES:
            problems.append(f"{rel}: status 非法（{fm.get('status')}）")
        if parse_aware_date(fm.get("date")) is None:
            problems.append(f"{rel}: date 不可解析或缺少时区")
    return problems


def as_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def build_index(root):
    entries, errors = [], []
    hist = root / "history"
    files = sorted(hist.glob("*.md")) if hist.is_dir() else []
    for f in files:
        if f.name == "INDEX.md":
            continue
        fm_text, body = split_frontmatter(f.read_text(encoding="utf-8"))
        fm = None
        if fm_text is not None:
            try:
                fm = yaml.safe_load(fm_text)
            except yaml.YAMLError:
                fm = None
        if not isinstance(fm, dict):
            errors.append(f"{f.name}: frontmatter 缺失或非法，无法入索引")
            continue
        title = next(
            (line[2:].strip() for line in body.splitlines() if line.startswith("# ")),
            None,
        )
        if title is None:
            errors.append(f"{f.name}: 正文缺少首个 \"# \" 标题")
            continue
        dt = parse_aware_date(fm.get("date"))
        if dt is None:
            errors.append(f"{f.name}: date 不可解析或缺少时区，无法排序")
            continue
        entries.append(
            {
                "file": f.name,
                "title": title,
                "date": dt.isoformat(),
                "keywords": as_list(fm.get("keywords")),
                "scope": as_list(fm.get("scope")),
                "type": fm.get("type"),
                "status": fm.get("status"),
                "supersedes": fm.get("supersedes"),
                "superseded_by": fm.get("superseded_by"),
                "pr": fm.get("pr"),
                "_dt": dt,
            }
        )
    entries.sort(key=lambda e: (e["_dt"], e["file"]))
    lines = ["# 历史索引", "", INDEX_NOTE, "", f"共 {len(entries)} 条。", ""]
    for e in entries:
        lines.append(
            f"- [{e['title']}]({e['file']}) — {e['date']} · {e['type']} · {e['status']}"
            f" · scope: {', '.join(e['scope'])} · keywords: {', '.join(e['keywords'])}"
        )
    md_text = "\n".join(lines) + "\n"
    json_entries = [{k: v for k, v in e.items() if k != "_dt"} for e in entries]
    json_text = json.dumps(json_entries, ensure_ascii=False, indent=2) + "\n"
    return md_text, json_text, errors


def check_index_freshness(root):
    md_text, json_text, errors = build_index(root)
    if errors:
        return [f"索引无法生成：{e}" for e in errors]
    problems = []
    for name, expected in (("INDEX.md", md_text), ("INDEX.json", json_text)):
        f = root / "history" / name
        if not f.is_file():
            problems.append(f"history/{name} 缺失")
        elif f.read_text(encoding="utf-8") != expected:
            problems.append(f"history/{name} 与 frontmatter 漂移，请运行 --write-index")
    return problems


def report(name, problems, ok_detail=""):
    if problems:
        print(f"FAIL {name}：" + "；".join(problems))
        return False
    print(f"PASS {name}" + (f"：{ok_detail}" if ok_detail else ""))
    return True


def run_change_checks(root, changed, impact):
    ok = True
    rules = impact.get("rules") or []
    exempt = impact.get("exempt_coverage") or []
    status_target = impact.get("status_target")
    nochange = os.environ.get("JMAPI_DOCS_NOCHANGE") == "true"

    uncovered = [
        p
        for p in sorted(changed)
        if not any(glob_match(r["glob"], p) for r in rules)
        and not any(glob_match(g, p) for g in exempt)
    ]
    ok &= report("覆盖率", [f"未登记文件 {p}" for p in uncovered], "全部变更文件已登记")

    if nochange:
        print("SKIP 漏改：JMAPI_DOCS_NOCHANGE=true 豁免（留痕）")
    else:
        missing = {}
        status_needed = False
        for p in sorted(changed):
            for r in rules:
                if not glob_match(r["glob"], p):
                    continue
                for target in (r.get("docs") or []) + (r.get("wiki") or []):
                    if target not in changed:
                        missing.setdefault(target, set()).add(p)
                if r.get("status") is True:
                    status_needed = True
        problems = [
            f"{t} 未同批变更（触发文件：{', '.join(sorted(src))}）"
            for t, src in sorted(missing.items())
        ]
        if status_needed and status_target and status_target not in changed:
            problems.append(f"命中 status: true 规则，但 {status_target} 未变更")
        ok &= report("漏改", problems, "文档目标均已同批变更")

    ok &= report("链接", check_links(root), "相对链接与锚点全部有效")
    ok &= report("中文门禁", check_chinese(root), "文档均含中文")
    ok &= report("禁入路径", [f"禁入文件 {p}" for p in check_forbidden(changed)])

    if nochange:
        print("SKIP status 新鲜度：JMAPI_DOCS_NOCHANGE=true 豁免（留痕）")
    else:
        touched = [p for p in sorted(changed) if p.startswith(("src/", "test/"))]
        problems = []
        if touched and status_target and status_target not in changed:
            problems.append(
                f"src/test 变更（{', '.join(touched)}）但 {status_target} 未更新"
            )
        ok &= report("status 新鲜度", problems)

    ok &= report("frontmatter", check_frontmatter(root))
    ok &= report("索引", check_index_freshness(root), "索引与 frontmatter 一致")
    return ok


def main():
    parser = argparse.ArgumentParser(description="文档门禁")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--local", action="store_true")
    mode.add_argument("--ci", action="store_true")
    mode.add_argument("--check-index", action="store_true")
    mode.add_argument("--write-index", action="store_true")
    parser.add_argument("--base", help="--ci 模式的基线 sha")
    args = parser.parse_args()
    if args.ci and not args.base:
        parser.error("--ci 需要 --base <sha>")

    root = Path(git(".", "rev-parse", "--show-toplevel").strip())

    if args.write_index:
        md_text, json_text, errors = build_index(root)
        if errors:
            report("索引", errors)
            return 1
        hist = root / "history"
        hist.mkdir(exist_ok=True)
        (hist / "INDEX.md").write_text(md_text, encoding="utf-8")
        (hist / "INDEX.json").write_text(json_text, encoding="utf-8")
        print("PASS 索引：已生成 history/INDEX.md 与 history/INDEX.json")
        return 0

    if args.check_index:
        return 0 if report("索引", check_index_freshness(root), "索引与 frontmatter 一致") else 1

    map_path = root / "docs" / "project" / "impact-map.yaml"
    if not map_path.is_file():
        print("FAIL 配置：缺少 docs/project/impact-map.yaml")
        return 1
    impact = yaml.safe_load(map_path.read_text(encoding="utf-8")) or {}
    changed = changed_files_local(root) if args.local else changed_files_ci(root, args.base)
    return 0 if run_change_checks(root, changed, impact) else 1


if __name__ == "__main__":
    sys.exit(main())