from __future__ import annotations

import html
import json
import re
from datetime import datetime
from typing import Any

import requests

from scripts.lib.market_data import (
    THS_CONCEPT_URL,
    fetch_limit_up_details_em,
    fetch_limit_up_details_wencai,
    get_recent_trade_dates,
    round_2,
    should_exclude_concept,
    to_number,
)
from scripts.lib.site_paths import SITE_DATA_DIR


OUTPUT_FILE = SITE_DATA_DIR / "hot_concepts.json"


def dense_rank_desc(values: list[float], value: float) -> int:
    unique_values = sorted(set(values), reverse=True)
    return unique_values.index(value) + 1


def min_max_score(value: float, min_value: float, max_value: float) -> float:
    if max_value == min_value:
        return 50.0
    return (value - min_value) / (max_value - min_value) * 100.0


def fetch_public_hot_concepts() -> list[dict[str, Any]]:
    headers = {"User-Agent": "Mozilla/5.0"}
    response = requests.get(THS_CONCEPT_URL, headers=headers, timeout=20)
    response.raise_for_status()
    text = response.content.decode("gbk", "ignore")

    match = re.search(r'<input type="hidden" id="gnSection" value=\'(.*?)\'>', text, re.S)
    if not match:
        raise RuntimeError("未在同花顺概念页中找到 gnSection 数据。")

    raw_value = html.unescape(match.group(1))
    payload = json.loads(raw_value)
    concepts: list[dict[str, Any]] = []

    for item in payload.values():
        name = str(item.get("platename") or "").strip()
        if should_exclude_concept(name):
            continue
        concepts.append(
            {
                "name": name,
                "concept_code": str(item.get("cid") or "").strip() or None,
                "plate_code": str(item.get("platecode") or "").strip() or None,
                "change_pct": round_2(to_number(item.get("199112"))),
                "net_inflow_yi": round_2(to_number(item.get("zjjlr"))),
            }
        )

    if not concepts:
        raise RuntimeError("同花顺概念页解析成功，但没有得到任何概念数据。")
    return concepts


def score_concepts(concepts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    change_values = [item["change_pct"] for item in concepts if item["change_pct"] is not None]
    flow_values = [item["net_inflow_yi"] for item in concepts if item["net_inflow_yi"] is not None]
    if not change_values or not flow_values:
        raise RuntimeError("缺少涨幅或资金流字段，无法计算综合热度。")

    min_change, max_change = min(change_values), max(change_values)
    min_flow, max_flow = min(flow_values), max(flow_values)

    for item in concepts:
        change_pct = float(item["change_pct"] if item["change_pct"] is not None else min_change)
        net_inflow_yi = float(item["net_inflow_yi"] if item["net_inflow_yi"] is not None else min_flow)
        change_score = min_max_score(change_pct, min_change, max_change)
        flow_score = min_max_score(net_inflow_yi, min_flow, max_flow)
        item["change_score"] = round_2(change_score)
        item["flow_score"] = round_2(flow_score)
        item["change_rank"] = dense_rank_desc(change_values, change_pct)
        item["flow_rank"] = dense_rank_desc(flow_values, net_inflow_yi)
        item["heat_score"] = round_2(change_score * 0.55 + flow_score * 0.45)

    return sorted(
        concepts,
        key=lambda item: (
            -(item["heat_score"] or -1),
            item["change_rank"],
            item["flow_rank"],
            item["name"],
        ),
    )


def fetch_limit_up_stocks(trade_date: str) -> list[dict[str, Any]]:
    details, ok = fetch_limit_up_details_wencai(trade_date)
    if not ok:
        details, ok = fetch_limit_up_details_em(trade_date)
    if not ok:
        raise RuntimeError(f"无法获取 {trade_date} 的涨停股明细。")
    return details


def collect_concept_limit_ups(concept_name: str, limit_up_stocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for item in limit_up_stocks:
        if concept_name not in (item.get("concepts") or []):
            continue
        matches.append(
            {
                "code": item.get("code"),
                "name": item.get("name"),
                "reason": item.get("reason"),
                "consecutive_boards": item.get("consecutive_boards"),
                "first_limit_up_time": item.get("first_limit_up_time"),
                "last_limit_up_time": item.get("last_limit_up_time"),
                "turnover_rate": item.get("turnover_rate"),
                "amount": round_2(to_number(item.get("amount"))),
            }
        )
    matches.sort(
        key=lambda item: (
            -(item["consecutive_boards"] or 0),
            item["first_limit_up_time"] or "99:99:99",
            item["code"] or "",
        )
    )
    return matches


def build_hot_concepts_payload(top_n: int = 10) -> dict[str, Any]:
    ranked = score_concepts(fetch_public_hot_concepts())
    latest_trade_date = max(get_recent_trade_dates())
    limit_up_stocks = fetch_limit_up_stocks(latest_trade_date)

    top_items = []
    for index, item in enumerate(ranked[:top_n], start=1):
        concept_limit_ups = collect_concept_limit_ups(item["name"], limit_up_stocks)
        top_items.append(
            {
                "rank": index,
                "name": item["name"],
                "concept_code": item["concept_code"],
                "plate_code": item["plate_code"],
                "heat_score": item["heat_score"],
                "change_pct": item["change_pct"],
                "net_inflow_yi": item["net_inflow_yi"],
                "change_rank": item["change_rank"],
                "flow_rank": item["flow_rank"],
                "change_score": item["change_score"],
                "flow_score": item["flow_score"],
                "limit_up_count": len(concept_limit_ups),
                "limit_up_stocks": concept_limit_ups,
            }
        )

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest_trade_date": latest_trade_date,
        "source": {
            "name": "同花顺概念板块公开网页",
            "url": THS_CONCEPT_URL,
        },
        "method": {
            "name": "综合热度近似排序",
            "formula": "heat_score = change_score * 0.55 + flow_score * 0.45",
            "note": "这是基于公开网页字段推导的近似热度，不是同花顺官方热榜原始分数。",
        },
        "top_n": top_n,
        "top_concepts": top_items,
        "all_count": len(ranked),
    }


def write_hot_concepts(top_n: int = 10) -> None:
    payload = build_hot_concepts_payload(top_n=top_n)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {OUTPUT_FILE}")
