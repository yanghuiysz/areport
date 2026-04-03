from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import akshare as ak
import pandas as pd


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


def fetch_market_activity() -> pd.DataFrame:
    trade_days_df = ak.tool_trade_date_hist_sina()
    if trade_days_df.empty:
        raise RuntimeError("未获取到交易日数据")
    today = datetime.now().date()
    trade_days = pd.to_datetime(trade_days_df["trade_date"], errors="coerce").dropna()
    trade_days = trade_days[trade_days.dt.date <= today]
    trade_days = trade_days.dt.strftime("%Y-%m-%d").tolist()
    recent_days = trade_days[-3:]
    if not recent_days:
        raise RuntimeError("未获取到最近交易日")

    activity_map: dict[str, Any] = {}
    stats_date: str | None = None
    try:
        activity_df = ak.stock_market_activity_legu()
        activity_map = {
            str(row["item"]).strip(): row["value"] for _, row in activity_df.iterrows()
        }
        stats_date_raw = str(activity_map.get("统计日期", "")).strip()
        stats_date = stats_date_raw[:10] if len(stats_date_raw) >= 10 else None
    except Exception:
        activity_map = {}
        stats_date = None

    rows: list[dict[str, Any]] = []
    for d in recent_days:
        # 涨跌家数来自乐咕乐股当日快照，历史日期暂无稳定公开接口，保留空值
        if d == stats_date:
            up_count = _to_number(activity_map.get("上涨"))
            down_count = _to_number(activity_map.get("下跌"))
            flat_count = _to_number(activity_map.get("平盘"))
        else:
            up_count = None
            down_count = None
            flat_count = None

        rows.append(
            {
                "date": d,
                "up_count": int(up_count) if up_count is not None else None,
                "down_count": int(down_count) if down_count is not None else None,
                "flat_count": int(flat_count) if flat_count is not None else None,
            }
        )
    return pd.DataFrame(rows)


def fetch_limit_up_details(trade_date: str) -> tuple[list[dict[str, Any]], bool]:
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
            "turnover_rate": _to_number(_pick_value(row, ["换手率"])),
            "first_limit_up_time": _normalize_time(_pick_value(row, ["首次封板时间", "首封时间", "首次涨停时间"])),
            "last_limit_up_time": _normalize_time(_pick_value(row, ["最后封板时间", "末次封板时间"])),
            "consecutive_boards": _pick_value(row, ["连板数", "连板天数"]),
        }
        rows.append(item)

    return rows, True


def fetch_limit_down_count(trade_date: str) -> int | None:
    ds = trade_date.replace("-", "")
    try:
        df = ak.stock_zt_pool_dtgc_em(date=ds)
    except Exception:
        return None
    return int(len(df.index))


def main() -> None:
    summary_df = fetch_market_activity()
    if summary_df.empty:
        raise RuntimeError("未获取到最近交易日概览数据")

    summary: list[dict[str, Any]] = []
    details_by_date: dict[str, list[dict[str, Any]]] = {}

    for _, row in summary_df.iterrows():
        trade_date = row["date"]
        details, details_ok = fetch_limit_up_details(trade_date)
        limit_up_count = len(details) if details_ok else None
        limit_down_count = fetch_limit_down_count(trade_date)
        summary.append(
            {
                "date": trade_date,
                "up_count": int(row["up_count"]) if pd.notna(row["up_count"]) else None,
                "down_count": int(row["down_count"]) if pd.notna(row["down_count"]) else None,
                "flat_count": int(row["flat_count"]) if pd.notna(row["flat_count"]) else None,
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
