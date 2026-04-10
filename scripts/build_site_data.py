from __future__ import annotations

from scripts.fetch_data import main as build_market_overview
from scripts.fetch_hot_concepts import main as build_hot_concepts


def main() -> None:
    build_market_overview()
    build_hot_concepts()


if __name__ == "__main__":
    main()
