# -*- coding: utf-8 -*-
"""把原始精修词库固化为 wordbank/curated.csv（一次性快照）。"""

import csv
from pathlib import Path

import words_data


def main():
    out = Path(__file__).resolve().parent / "wordbank" / "curated.csv"
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["level", "word", "phonetic", "pos", "meaning", "example", "example_zh"])
        for level, entries in words_data.WORDS.items():
            for entry in entries:
                writer.writerow([level] + list(entry))
    print("saved", out)


if __name__ == "__main__":
    main()
