const DATA_URL = `data/latest.json?t=${Date.now()}`;

const generatedAtEl = document.getElementById("generatedAt");
const summaryCardsEl = document.getElementById("summaryCards");
const dateFilterEl = document.getElementById("dateFilter");
const dateFilterTableEl = document.getElementById("dateFilterTable");
const reasonFilterEl = document.getElementById("reasonFilter");
const reasonStatsEl = document.getElementById("reasonStats");
const detailTableBodyEl = document.getElementById("detailTableBody");

let state = {
  summary: [],
  detailsByDate: {}
};

function toYi(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return "-";
  }
  return (Number(amount) / 1e8).toFixed(2);
}

function buildReasonStats(rows) {
  const stats = {};
  rows.forEach((row) => {
    const key = row.reason || "其他";
    stats[key] = (stats[key] || 0) + 1;
  });
  return Object.entries(stats)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function renderSummary() {
  summaryCardsEl.innerHTML = "";
  state.summary.forEach((item) => {
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = `
      <p class="summary-title">${item.date}</p>
      <p class="summary-row"><span>上涨家数</span><span class="value-up">${item.up_count ?? "-"}</span></p>
      <p class="summary-row"><span>下跌家数</span><span class="value-down">${item.down_count ?? "-"}</span></p>
      <p class="summary-row"><span>涨停家数</span><span class="value-up">${item.limit_up_count ?? "-"}</span></p>
      <p class="summary-row"><span>跌停家数</span><span class="value-down">${item.limit_down_count ?? "-"}</span></p>
    `;
    summaryCardsEl.appendChild(card);
  });
}

function renderReasonStats(date) {
  reasonStatsEl.innerHTML = "";
  const rows = state.detailsByDate[date] || [];
  const stats = buildReasonStats(rows);
  if (!stats.length) {
    reasonStatsEl.innerHTML = `<p class="muted">该日期暂无涨停明细。</p>`;
    return;
  }
  stats.forEach((item) => {
    const el = document.createElement("article");
    el.className = "reason-item";
    el.innerHTML = `<p class="reason-name">${item.reason}</p><p>家数：${item.count}</p>`;
    reasonStatsEl.appendChild(el);
  });
}

function renderReasonFilter(date) {
  const rows = state.detailsByDate[date] || [];
  const reasons = ["全部", ...buildReasonStats(rows).map((x) => x.reason)];
  reasonFilterEl.innerHTML = reasons.map((r) => `<option value="${r}">${r}</option>`).join("");
}

function renderTable() {
  const date = dateFilterTableEl.value;
  const reason = reasonFilterEl.value;
  const rows = (state.detailsByDate[date] || []).filter((row) => {
    if (reason === "全部") return true;
    return row.reason === reason;
  });

  detailTableBodyEl.innerHTML = "";
  if (!rows.length) {
    detailTableBodyEl.innerHTML = `<tr><td colspan="8" class="muted">没有匹配数据</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.code || "-"}</td>
      <td>${row.name || "-"}</td>
      <td>${row.reason || "-"}</td>
      <td>${toYi(row.amount)}</td>
      <td>${row.turnover_rate ?? "-"}</td>
      <td>${row.first_limit_up_time || "-"}</td>
      <td>${row.last_limit_up_time || "-"}</td>
      <td>${row.consecutive_boards ?? "-"}</td>
    `;
    detailTableBodyEl.appendChild(tr);
  });
}

function bindEvents() {
  dateFilterEl.addEventListener("change", () => {
    renderReasonStats(dateFilterEl.value);
  });
  dateFilterTableEl.addEventListener("change", () => {
    renderReasonFilter(dateFilterTableEl.value);
    renderTable();
  });
  reasonFilterEl.addEventListener("change", renderTable);
}

async function init() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    state.summary = data.summary || [];
    state.detailsByDate = data.limit_up_details_by_date || {};
    generatedAtEl.textContent = `数据更新时间：${data.generated_at || "-"}`;

    renderSummary();

    const dates = state.summary.map((x) => x.date);
    const options = dates.map((d) => `<option value="${d}">${d}</option>`).join("");
    dateFilterEl.innerHTML = options;
    dateFilterTableEl.innerHTML = options;

    if (dates.length) {
      dateFilterEl.value = dates[0];
      dateFilterTableEl.value = dates[0];
    }

    renderReasonStats(dateFilterEl.value);
    renderReasonFilter(dateFilterTableEl.value);
    renderTable();
    bindEvents();
  } catch (err) {
    generatedAtEl.textContent = "数据加载失败，请检查 data/latest.json 是否存在。";
    console.error(err);
  }
}

init();
