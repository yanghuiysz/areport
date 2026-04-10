from __future__ import annotations

import argparse

from scripts.lib.hot_concepts import write_hot_concepts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="抓取同花顺公开概念板块并生成综合热度前N。")
    parser.add_argument("--top", type=int, default=10, help="输出前 N 名，默认 10")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    write_hot_concepts(top_n=args.top)


if __name__ == "__main__":
    main()
