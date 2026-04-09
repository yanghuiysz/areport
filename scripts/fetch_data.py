from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import pywencai
import akshare as ak


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FILE = ROOT / "data" / "latest.json"


def _pick_value(row: pd.Series, candidates: list[str]) -> Any:
    for key in candidates:
        if key in row and pd.notna(row[key]):
            return row[key]
    return None


def _pick_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for key in candidates:
        if key in df.columns:
            return key
    return None


def _pick_col_contains(df: pd.DataFrame, keywords: list[str], ds: str | None = None) -> str | None:
    for col in df.columns:
        col_text = str(col)
        if ds and f"[{ds}]" not in col_text:
            continue
        if all(k in col_text for k in keywords):
            return col_text
    for col in df.columns:
        col_text = str(col)
        if all(k in col_text for k in keywords):
            return col_text
    return None


def _normalize_time(value: Any) -> str | None:
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


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int_count(value: Any) -> int | None:
    number = _to_number(value)
    if number is None:
        return None
    return int(number)


def _round_2(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)


def _is_st_stock(name: Any) -> bool:
    if name is None:
        return False
    normalized = str(name).strip().upper().replace(" ", "")
    return "ST" in normalized


def _extract_ds_from_columns(columns: list[Any]) -> str | None:
    for col in columns:
        match = re.search(r"\[(\d{8})\]", str(col))
        if match:
            return match.group(1)
    return None


def _resolve_trade_date(ask_date: str) -> str | None:
    query = f"{_cn_date(ask_date)}涨停股票"
    try:
        df = pywencai.get(query=query, loop=True)
    except Exception:
        return None
    if df is None:
        return None
    resolved_ds = _extract_ds_from_columns(df.columns.tolist())
    if resolved_ds is None:
        return ask_date
    return f"{resolved_ds[0:4]}-{resolved_ds[4:6]}-{resolved_ds[6:8]}"


def get_recent_trade_dates() -> list[str]:
    cursor = datetime.now().date()
    resolved_days: list[str] = []
    seen = set()
    for _ in range(0, 10):
        ask_date = cursor.strftime("%Y-%m-%d")
        resolved_date = _resolve_trade_date(ask_date)
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


def _cn_date(trade_date: str) -> str:
    dt = datetime.strptime(trade_date, "%Y-%m-%d")
    return f"{dt.year}年{dt.month}月{dt.day}日"


def fetch_up_down_counts_wencai(trade_date: str) -> tuple[int | None, int | None, int | None]:
    ds = trade_date.replace("-", "")
    query = f"{_cn_date(trade_date)} A股涨跌幅"
    try:
        df = pywencai.get(query=query, loop=True)
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
    up_count = int((series > 0).sum())
    down_count = int((series < 0).sum())
    flat_count = int((series == 0).sum())
    return up_count, down_count, flat_count


def fetch_limit_up_details_wencai(trade_date: str) -> tuple[list[dict[str, Any]], bool]:
    ds = trade_date.replace("-", "")
    query = (
        f"{_cn_date(trade_date)}涨停股票，涨停原因，成交额，换手率，首次涨停时间，"
        "最终涨停时间，连续涨停天数"
    )
    try:
        df = pywencai.get(query=query, loop=True)
    except Exception:
        return [], False
    if df is None or df.empty:
        return [], True

    code_col = _pick_col_contains(df, ["股票代码"])
    name_col = _pick_col_contains(df, ["股票简称"])
    reason_col = _pick_col_contains(df, ["涨停原因类别"], ds=ds)
    amount_col = _pick_col_contains(df, ["成交额"], ds=ds)
    turnover_col = _pick_col_contains(df, ["换手率"], ds=ds)
    first_col = _pick_col_contains(df, ["首次涨停时间"], ds=ds)
    last_col = _pick_col_contains(df, ["最终涨停时间"], ds=ds) or _pick_col_contains(df, ["最后涨停时间"], ds=ds)
    boards_col = _pick_col_contains(df, ["连续涨停天数"], ds=ds)
    if boards_col is None:
        boards_col = _pick_col_contains(df, ["几天几板"], ds=ds)

    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        stock_name = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else None
        if _is_st_stock(stock_name):
            continue
        reason_text = row[reason_col] if reason_col and pd.notna(row[reason_col]) else "其他"
        item = {
            "code": str(row[code_col]).split(".")[0] if code_col and pd.notna(row[code_col]) else None,
            "name": stock_name,
            "reason": str(reason_text).strip(),
            "amount": _to_number(row[amount_col]) if amount_col else None,
            "turnover_rate": _round_2(_to_number(row[turnover_col])) if turnover_col else None,
            "first_limit_up_time": _normalize_time(row[first_col]) if first_col else None,
            "last_limit_up_time": _normalize_time(row[last_col]) if last_col else None,
            "consecutive_boards": _to_int_count(row[boards_col]) if boards_col else None,
        }
        rows.append(item)
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
            "amount": _to_number(_pick_value(row, ["成交额", "成交金额"])),
            "turnover_rate": _round_2(_to_number(_pick_value(row, ["换手率"]))),
            "first_limit_up_time": _normalize_time(_pick_value(row, ["首次封板时间", "首封时间", "首次涨停时间"])),
            "last_limit_up_time": _normalize_time(_pick_value(row, ["最后封板时间", "末次封板时间"])),
            "consecutive_boards": _pick_value(row, ["连板数", "连板天数"]),
        }
        if _is_st_stock(item.get("name")):
            continue
        rows.append(item)

    return rows, True


def fetch_limit_down_count_wencai(trade_date: str) -> int | None:
    query = f"{_cn_date(trade_date)}跌停股票"
    try:
        df = pywencai.get(query=query, loop=True)
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


def main() -> None:
    summary: list[dict[str, Any]] = []
    details_by_date: dict[str, list[dict[str, Any]]] = {}
    recent_days = get_recent_trade_dates()

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

    payload = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": sorted(summary, key=lambda x: x["date"], reverse=True),
        "limit_up_details_by_date": details_by_date,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"written: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
