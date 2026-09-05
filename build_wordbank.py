# -*- coding: utf-8 -*-
"""词库构建脚本。

把以下数据源合并为 wordbank/ 下按范围划分的 CSV：
1. 项目原有 720 条人工精修词条（含音标/例句）
2. KyleBing/english-vocabulary：四级/六级/考研/托福/SAT（词条 + 释义）
3. ismartcoding/endict：官方 2016 版四六级大纲词表（MIT）

生成产物：
- wordbank/*.csv         可维护的词库（新增词或新范围只需加 CSV）
- browser-extension/words.js  扩展运行时词库
- words_data.py          桌面宠物兼容词库
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

import words_data


ROOT = Path(__file__).resolve().parent
WORDBANK = ROOT / "wordbank"
KYE = ROOT / "wordbank-src-kye"
ENDICT = ROOT / "wordbank-src-endict"

LEVELS = ["CET4", "CET6", "考研", "托福", "SAT"]
POS_RE = re.compile(
    r"^(?P<pos>(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|abbr|exclam|link-v)\.?)"
)


def clean_word(raw: str) -> str:
    w = raw.strip().lower()
    w = re.sub(r"\s+", " ", w)
    if not re.fullmatch(r"[a-z][a-z'.\- ]*", w):
        return ""
    if any(ch.isdigit() for ch in w):
        return ""
    return w


def split_pos(meaning: str):
    """从释义文本中拆出词性，如 'n. 小船；轮船 v. 划船' -> ('n.', '小船；轮船 v. 划船')。"""
    m = re.match(r"^\s*((?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|aux|abbr)\.?)\s+", meaning)
    if m:
        return m.group(1), meaning[m.end():].strip()
    return "", meaning.strip()


def clean_meaning(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:200]


def load_kyle(level_file: str):
    """读取 KyleBing 的 '单词\\t释义' txt。"""
    path = KYE / level_file
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "\t" not in line:
            continue
        word_raw, meaning = line.split("\t", 1)
        word = clean_word(word_raw)
        if not word:
            continue
        meaning = clean_meaning(meaning)
        if not meaning:
            continue
        pos, meaning2 = split_pos(meaning)
        if word in out:
            continue
        out[word] = [word, "", pos, meaning2, "", ""]
    return out


def load_official(level_file: str):
    """读取 endict 官方大纲词表（仅单词）。"""
    path = ENDICT / "vocabulary" / level_file
    out = {}
    if not path.exists():
        return out
    for word_raw in json.loads(path.read_text(encoding="utf-8")):
        word = clean_word(word_raw)
        if word:
            out.setdefault(word, [word, "", "", "", "", ""])
    return out


def load_curated():
    """读取项目原有精修词条，按 (level, word) 组织。"""
    out = {}
    snapshot = WORDBANK / "curated.csv"
    if snapshot.exists():
        with open(snapshot, encoding="utf-8-sig", newline="") as f:
            for i, row in enumerate(csv.reader(f)):
                if i == 0:
                    continue
                if len(row) >= 7 and row[1].strip():
                    level = row[0].strip()
                    word = row[1].strip().lower()
                    out[(level, word)] = [row[1], row[2], row[3], row[4], row[5], row[6]]
        return out
    for level, entries in words_data.WORDS.items():
        for (word, phonetic, pos, meaning, example, ex_zh) in entries:
            key = word.lower()
            out[(level, key)] = [word, phonetic, pos, meaning, example, ex_zh]
    return out


def build_csvs():
    WORDBANK.mkdir(exist_ok=True)
    curated = load_curated()
    # 首次运行时把精修词条固化为 wordbank/curated.csv，作为以后构建的稳定来源
    if not (WORDBANK / "curated.csv").exists():
        with open(WORDBANK / "curated.csv", "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["level", "word", "phonetic", "pos", "meaning", "example", "example_zh"])
            for level in ["CET4", "CET6"]:
                for row in words_data.WORDS.get(level, []):
                    writer.writerow([level] + list(row))
    kye_map = {
        "CET4": load_kyle("3 四级-乱序.txt"),
        "CET6": load_kyle("4 六级-乱序.txt"),
        "考研": load_kyle("5 考研-乱序.txt"),
        "托福": load_kyle("6 托福-乱序.txt"),
        "SAT": load_kyle("7 SAT-乱序.txt"),
    }
    # 跨范围补全：用任意范围里已有的释义补缺失词条
    kye_global = {}
    for rows in kye_map.values():
        for word, row in rows.items():
            if row[3]:
                kye_global.setdefault(word, row)
    official = {
        "CET4": load_official("cet4.json"),
        "CET6": load_official("cet6.json"),
        "考研": {},
        "托福": {},
        "SAT": {},
    }

    counts = {}
    for level in LEVELS:
        merged = {
            word: row
            for (cur_level, word), row in curated.items()
            if cur_level == level
        }
        for word, row in kye_map[level].items():
            merged.setdefault(word, row)
        for word, row in official[level].items():
            if word not in merged:
                merged[word] = kye_global.get(word, row)
        # 丢弃没有释义的裸词
        merged = {k: v for k, v in merged.items() if v[3].strip()}
        rows = sorted(merged.values(), key=lambda r: r[0].lower())
        path = WORDBANK / f"{level}.csv"
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["word", "phonetic", "pos", "meaning", "example", "example_zh"])
            writer.writerows(rows)
        counts[level] = len(rows)
    return counts


def load_csvs():
    data = {}
    for path in sorted(WORDBANK.glob("*.csv")):
        if path.name == "curated.csv":
            continue
        level = path.stem
        rows = []
        with open(path, encoding="utf-8-sig", newline="") as f:
            for i, row in enumerate(csv.reader(f)):
                if i == 0:
                    continue
                if len(row) >= 6 and row[0].strip():
                    rows.append([c.strip() for c in row[:6]])
        if rows:
            data[level] = rows
    return data


def build_words_js():
    data = load_csvs()
    js = "// 由 build_wordbank.py 从 wordbank/*.csv 自动生成，请勿手改\n"
    js += "var WINDOW_WORDS = " + json.dumps(data, ensure_ascii=False) + ";\n"
    out = ROOT / "browser-extension" / "words.js"
    out.write_text(js, encoding="utf-8")
    return len(json.dumps(data))


def build_words_py():
    data = load_csvs()
    lines = [
        "# -*- coding: utf-8 -*-",
        '"""由 build_wordbank.py 从 wordbank/*.csv 自动生成，请勿手改。"""',
        "",
        "WORDS = {",
    ]
    for level, rows in data.items():
        lines.append(f"    {json.dumps(level, ensure_ascii=False)}: [")
        for row in rows:
            lines.append("        " + json.dumps(row, ensure_ascii=False) + ",")
        lines.append("    ],")
    lines.append("}")
    (ROOT / "words_data.py").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    counts = build_csvs()
    print("CSV 词条数：", counts)
    size = build_words_js()
    print("words.js 生成，JSON 大小：", size)
    build_words_py()
    print("words_data.py 已重新生成")


if __name__ == "__main__":
    main()
