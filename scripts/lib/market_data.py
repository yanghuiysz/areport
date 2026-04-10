from __future__ import annotations

import html
import json
import re
from datetime import datetime, timedelta
from typing import Any

import akshare as ak
import pandas as pd
import pywencai
import requests

from scripts.lib.site_paths import SITE_DATA_DIR


OUTPUT_FILE = SITE_DATA_DIR / "latest.json"
THS_CONCEPT_URL = "https://q.10jqka.com.cn/gn/"
EXCLUDED_CONCEPT_KEYWORDS = [
    "鍥戒紒鏀归潻",
    "澶紒鏀归潻",
    "鍦版柟鍥借祫鏀归潻",
    "澶紒鍥借祫鏀归潻",
    "鍥借祫浜?," ,
    "涓瓧澶?," ,
    "涓婃捣鍥戒紒鏀归潻",
    "娣卞湷鍥借祫鏀归潻",
    "鍖椾含鍥借祫鏀归潻",
    "鎴愭笣鐗瑰尯",
    "闆勫畨鏂板尯",
    "娴峰崡鑷锤鍖?," ,
    "骞夸笢鑷锤鍖?," ,
    "涓婃捣鑷锤鍖?," ,
    "绂忓缓鑷锤鍖?," ,
    "鏂扮枂鎸叴",
    "瑗块儴澶у紑鍙?," ,
    "涓滃寳鎸叴",
    "浜触鍐€涓€浣撳寲",
    "闀夸笁瑙掍竴浣撳寲",
    "绮ゆ腐婢冲ぇ婀惧尯",
]


def _pick_value(row: pd.Series, candidates: list[str]) -> Any:
    for key in candidates:
        if key in row and pd.notna(row[key]):
            return row[key]
    return None


def _pick_col_contains(df: pd.DataFrame, keywords: list[str], ds: str | None = None) -> str | None:
    for col in df.columns:
        col_text = str(col)
        if ds and f"[{ds}]" not in col_text:
            continue
        if all(keyword in col_text for keyword in keywords):
            return col_text
    for col in df.columns:
        col_text = str(col)
        if all(keyword in col_text for keyword in keywords):
            return col_text
    return None


def normalize_time(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    digits = "".join(ch for ch in text if ch.isdigit())
    if len(digits) >= 6:
        digits = digits[-6:]
        return f"{digits[0:2]}:{digits[2:4]}:{digits[4:6]}"
    return text


def to_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_int_count(value: Any) -> int | None:
    number = to_number(value)
    if number is None:
        return None
    return int(number)


def round_2(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def is_st_stock(name: Any) -> bool:
    if name is None:
        return False
    normalized = str(name).strip().upper().replace(" ", "")
    return "ST" in normalized


def extract_ds_from_columns(columns: list[Any]) -> str | None:
    for col in columns:
        match = re.search(r"\[(\d{8})\]", str(col))
        if match:
            return match.group(1)
    return None


def ensure_dataframe(result: Any) -> pd.DataFrame | None:
    if isinstance(result, pd.DataFrame):
        return result
    if isinstance(result, dict):
        for value in result.values():
            if isinstance(value, pd.DataFrame):
                return value
    return None


def split_concepts(value: Any) -> list[str]:
    if value is None:
        return []
    parts = re.split(r"[;锛?锛屻€?|\s]+", str(value).strip())
    seen: set[str] = set()
    items: list[str] = []
    for part in parts:
        text = part.strip()
        if not text or text.lower() == "nan" or text in seen:
            continue
        seen.add(text)
        items.append(text)
    return items


def should_exclude_concept(name: str) -> bool:
    text = str(name or "").strip()
    if not text:
        return True
    return any(keyword in text for keyword in EXCLUDED_CONCEPT_KEYWORDS)


def cn_date(trade_date: str) -> str:
    dt = datetime.strptime(trade_date, "%Y-%m-%d")
    return f"{dt.year}年{dt.month}月{dt.day}日"


def resolve_trade_date(ask_date: str) -> str | None:
    query = f"{cn_date(ask_date)}娑ㄥ仠鑲＄エ"
    try:
        df = ensure_dataframe(pywencai.get(query=query, loop=True))
    except Exception:
        return None
    if df is None:
        return None
    resolved_ds = extract_ds_from_columns(df.columns.tolist())
    if resolved_ds is None:
        return ask_date
    return f"{resolved_ds[0:4]}-{resolved_ds[4:6]}-{resolved_ds[6:8]}"


def get_recent_trade_dates() -> list[str]:
    cursor = datetime.now().date()
    resolved_days: list[str] = []
    seen: set[str] = set()
    for _ in range(10):
        ask_date = cursor.strftime("%Y-%m-%d")
        resolved_date = resolve_trade_date(ask_date)
        if resolved_date is None:
            cursor -= timedelta(days=1)
            continue
        if resolved_date not in seen:
            seen.add(resolved_date)
            resolved_days.append(resolved_date)
        if len(resolved_days) >= 3:
            break
        cursor = datetime.strptime(resolved_date, "%Y-%m-%d").date() - timedelta(days=1)
    if len(resolved_days) >= 3:
        return sorted(resolved_days)[-3:]

    fallback: list[str] = []
    day = datetime.now().date()
    while len(fallback) < 3:
        if day.weekday() < 5:
            fallback.append(day.strftime("%Y-%m-%d"))
        day -= timedelta(days=1)
    return sorted(fallback)[-3:]


def fetch_up_down_counts_wencai(trade_date: str) -> tuple[int | None, int | None, int | None]:
    ds = trade_date.replace("-", "")
    query = f"{cn_date(trade_date)} A股涨跌幅"
    try:
        df = ensure_dataframe(pywencai.get(query=query, loop=True))
    except Exception:
        return None, None, None
    if df is None or df.empty:
        return None, None, None
    col = _pick_col_contains(df, ["涨跌幅"], ds=ds)
    if col is None:
        return None, None, None
    series = pd.to_numeric(df[col], errors="coerce").dropna()
    if series.empty:
        return None, None, None
    return int((series > 0).sum()), int((series < 0).sum()), int((series == 0).sum())


def fetch_limit_up_details_wencai(trade_date: str) -> tuple[list[dict[str, Any]], bool]:
    ds = trade_date.replace("-", "")
    query = (
        f"{cn_date(trade_date)}涨停股票，所属概念，涨停原因类别，成交额，换手率，"
        "首次涨停时间，最终涨停时间，连续涨停天数"
    )
    try:
        df = ensure_dataframe(pywencai.get(query=query, loop=True))
    except Exception:
        return [], False
    if df is None or df.empty:
        return [], True

    code_col = _pick_col_contains(df, ["股票代码"])
    name_col = _pick_col_contains(df, ["股票简称"])
    concept_col = _pick_col_contains(df, ["所属概念"])
    reason_col = _pick_col_contains(df, ["涨停原因类别"], ds=ds)
    amount_col = _pick_col_contains(df, ["成交额"], ds=ds)
    turnover_col = _pick_col_contains(df, ["换手率"], ds=ds)
    first_col = _pick_col_contains(df, ["首次涨停时间"], ds=ds)
    last_col = _pick_col_contains(df, ["最终涨停时间"], ds=ds) or _pick_col_contains(df, ["最后涨停时间"], ds=ds)
    boards_col = _pick_col_contains(df, ["连续涨停天数"], ds=ds) or _pick_col_contains(df, ["几天几板"], ds=ds)

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        stock_name = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None
        if is_st_stock(stock_name):
            continue
        reason_value = row[reason_col] if reason_col and pd.notna(row[reason_col]) else "其他"
        concepts = split_concepts(row[concept_col]) if concept_col and pd.notna(row[concept_col]) else []
        rows.append(
            {
                "code": str(row[code_col]).split(".")[0] if code_col and pd.notna(row[code_col]) else None,
                "name": stock_name,
                "reason": str(reason_value).strip(),
                "concepts": concepts,
                "amount": to_number(row[amount_col]) if amount_col else None,
                "turnover_rate": round_2(to_number(row[turnover_col])) if turnover_col else None,
                "first_limit_up_time": normalize_time(row[first_col]) if first_col else None,
                "last_limit_up_time": normalize_time(row[last_col]) if last_col else None,
                "consecutive_boards": to_int_count(row[boards_col]) if boards_col else None,
            }
        )
    return rows, True


def fetch_limit_up_details_em(trade_date: str) -> tuple[list[dict[str, Any]], bool]:
    ds = trade_date.replace("-", "")
    try:
        df = ak.stock_zt_pool_em(date=ds)
    except Exception:
        return [], False
    if df.empty:
        return [], True

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        reason = _pick_value(row, ["涨停原因类别", "涨停原因", "所属行业", "概念"])
        item = {
            "code": _pick_value(row, ["代码", "股票代码"]),
            "name": _pick_value(row, ["名称", "股票简称"]),
            "reason": str(reason).strip() if reason is not None else "其他",
            "concepts": [],
            "amount": to_number(_pick_value(row, ["成交额", "成交金额"])),
            "turnover_rate": round_2(to_number(_pick_value(row, ["换手率"]))),
            "first_limit_up_time": normalize_time(_pick_value(row, ["首次封板时间", "首封时间", "首次涨停时间"])),
            "last_limit_up_time": normalize_time(_pick_value(row, ["最后封板时间", "末次封板时间"])),
            "consecutive_boards": to_int_count(_pick_value(row, ["连板数", "连板天数"])),
        }
        if is_st_stock(item.get("name")):
            continue
        rows.append(item)
    return rows, True


def fetch_limit_down_count_wencai(trade_date: str) -> int | None:
    query = f"{cn_date(trade_date)}跌停股票"
    try:
        df = ensure_dataframe(pywencai.get(query=query, loop=True))
    except Exception:
        return None
    if df is None:
        return None
    return int(len(df.index))


def fetch_limit_down_count_em(trade_date: str) -> int | None:
    ds = trade_date.replace("-", "")
    try:
        df = ak.stock_zt_pool_dtgc_em(date=ds)
    except Exception:
        return None
    return int(len(df.index))


def fetch_ths_concepts() -> list[dict[str, Any]]:
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(THS_CONCEPT_URL, headers=headers, timeout=15)
        response.raise_for_status()
        text = response.content.decode("gbk", "ignore")
    except Exception:
        try:
            fallback_df = ak.stock_board_concept_name_ths()
        except Exception:
            return []
        return [
            {
                "name": name,
                "code": str(row["code"]).strip(),
                "plate_code": None,
                "change_pct": None,
                "net_inflow_yi": None,
            }
            for _, row in fallback_df.iterrows()
            for name in [str(row["name"]).strip()]
            if name and not should_exclude_concept(name)
        ]

    match = re.search(r'<input type="hidden" id="gnSection" value=\'(.*?)\'>', text, re.S)
    if not match:
        return []

    raw_value = html.unescape(match.group(1))
    data = json.loads(raw_value)
    dedup: dict[str, dict[str, Any]] = {}
    for item in data.values():
        name = str(item.get("platename") or "").strip()
        if not name or should_exclude_concept(name):
            continue
        dedup[name] = {
            "name": name,
            "code": str(item.get("cid") or "").strip() or None,
            "plate_code": str(item.get("platecode") or "").strip() or None,
            "change_pct": round_2(to_number(item.get("199112"))),
            "net_inflow_yi": round_2(to_number(item.get("zjjlr"))),
        }

    return sorted(
        dedup.values(),
        key=lambda item: (
            -(item["change_pct"] if item["change_pct"] is not None else -10_000),
            item["name"],
        ),
    )


def group_limit_up_by_concept(
    rows: list[dict[str, Any]],
    concept_meta_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    valid_concepts = set(concept_meta_map.keys())

    for row in rows:
        concepts = [concept for concept in row.get("concepts", []) if concept in valid_concepts]
        if not concepts:
            continue
        seen: set[str] = set()
        for concept in concepts:
            if concept in seen:
                continue
            seen.add(concept)
            group = groups.setdefault(
                concept,
                {
                    "concept": concept,
                    "concept_code": concept_meta_map.get(concept, {}).get("code"),
                    "change_pct": concept_meta_map.get(concept, {}).get("change_pct"),
                    "net_inflow_yi": concept_meta_map.get(concept, {}).get("net_inflow_yi"),
                    "count": 0,
                    "amount": 0.0,
                    "rows": [],
                },
            )
            group["rows"].append(row)
            group["count"] += 1
            group["amount"] += float(row.get("amount") or 0)

    result = list(groups.values())
    result.sort(key=lambda item: (-item["count"], -(item["amount"] or 0), item["concept"]))
    return result


def build_market_overview_payload() -> dict[str, Any]:
    recent_days = get_recent_trade_dates()
    latest_trade_date = max(recent_days) if recent_days else None
    concept_meta = fetch_ths_concepts()
    concept_meta_map = {item["name"]: item for item in concept_meta}

    summary: list[dict[str, Any]] = []
    details_by_date: dict[str, list[dict[str, Any]]] = {}
    concept_groups_by_date: dict[str, list[dict[str, Any]]] = {}

    for trade_date in recent_days:
        up_count, down_count, flat_count = fetch_up_down_counts_wencai(trade_date)
        details, details_ok = fetch_limit_up_details_wencai(trade_date)
        if not details_ok:
            details, details_ok = fetch_limit_up_details_em(trade_date)
        limit_up_count = len(details) if details_ok else None

        limit_down_count = fetch_limit_down_count_wencai(trade_date)
        if limit_down_count is None:
            limit_down_count = fetch_limit_down_count_em(trade_date)

        summary.append(
            {
                "date": trade_date,
                "up_count": up_count,
                "down_count": down_count,
                "flat_count": flat_count,
                "limit_up_count": limit_up_count,
                "limit_down_count": limit_down_count,
            }
        )
        details_by_date[trade_date] = details
        concept_groups_by_date[trade_date] = group_limit_up_by_concept(details, concept_meta_map)

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "latest_trade_date": latest_trade_date,
        "summary": sorted(summary, key=lambda item: item["date"], reverse=True),
        "limit_up_details_by_date": details_by_date,
        "limit_up_concepts_by_date": concept_groups_by_date,
    }


def write_market_overview() -> None:
    payload = build_market_overview_payload()
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {OUTPUT_FILE}")
