const generatedAtEl = document.getElementById("generatedAt");
const refreshBtnEl = document.getElementById("refreshBtn");
const summaryCardsEl = document.getElementById("summaryCards");
const upDownChartEl = document.getElementById("upDownChart");
const limitChartEl = document.getElementById("limitChart");
const dateFilterEl = document.getElementById("dateFilter");
const dateFilterTableEl = document.getElementById("dateFilterTable");
const reasonFilterEl = document.getElementById("reasonFilter");
const top3OnlyEl = document.getElementById("top3Only");
const reasonStatsEl = document.getElementById("reasonStats");
const detailTableBodyEl = document.getElementById("detailTableBody");
const sortableHeaderEls = document.querySelectorAll("th.sortable");

let state = {
  summary: [],
  detailsByDate: {},
  sort: { key: "amount", dir: "desc" },
  loading: false
};

function toYi(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return "-";
  }
  return (Number(amount) / 1e8).toFixed(2);
}

function splitReasonTags(reason) {
  if (!reason) return ["其他"];
  const tags = String(reason)
    .split(/[+＋,，、/|;；\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set(tags.length ? tags : ["其他"])];
}

function buildReasonStats(rows) {
  const stats = {};
  rows.forEach((row) => {
    splitReasonTags(row.reason).forEach((tag) => {
      stats[tag] = (stats[tag] || 0) + 1;
    });
  });
  return Object.entries(stats)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

function getTop3Reasons(date) {
  return buildReasonStats(state.detailsByDate[date] || [])
    .slice(0, 3)
    .map((item) => item.reason);
}

function parseTimeToNumber(value) {
  if (!value || value === "-") return -1;
  const parts = String(value).split(":").map(Number);
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) return -1;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function compareByKey(a, b, key) {
  const va = a[key];
  const vb = b[key];
  if (key === "amount" || key === "turnover_rate" || key === "consecutive_boards") {
    const na = Number(va);
    const nb = Number(vb);
    return (Number.isNaN(na) ? -Infinity : na) - (Number.isNaN(nb) ? -Infinity : nb);
  }
  if (key === "first_limit_up_time" || key === "last_limit_up_time") {
    return parseTimeToNumber(va) - parseTimeToNumber(vb);
  }
  return String(va || "").localeCompare(String(vb || ""), "zh-CN");
}

function drawLineChart(svgEl, labels, series) {
  const width = 620;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 36, left: 42 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values).filter((x) => x !== null && x !== undefined);
  if (!allValues.length) {
    svgEl.innerHTML = `<text x="20" y="40" fill="#6b7280" font-size="14">暂无可绘制数据</text>`;
    return;
  }

  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const yMin = Math.min(0, minVal);
  const yMax = maxVal === yMin ? yMin + 1 : maxVal;

  const xPos = (idx) => {
    if (labels.length === 1) return padding.left + innerW / 2;
    return padding.left + (idx / (labels.length - 1)) * innerW;
  };
  const yPos = (val) => padding.top + ((yMax - val) / (yMax - yMin)) * innerH;

  let html = "";
  html += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerH}" stroke="#d1d5db" />`;
  html += `<line x1="${padding.left}" y1="${padding.top + innerH}" x2="${padding.left + innerW}" y2="${padding.top + innerH}" stroke="#d1d5db" />`;

  labels.forEach((label, idx) => {
    html += `<text x="${xPos(idx)}" y="${height - 12}" text-anchor="middle" fill="#6b7280" font-size="12">${label.slice(5)}</text>`;
  });

  series.forEach((s) => {
    const points = s.values
      .map((v, idx) => (v === null || v === undefined ? null : `${xPos(idx)},${yPos(v)}`))
      .filter(Boolean)
      .join(" ");
    if (points) {
      html += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${points}" />`;
    }
    s.values.forEach((v, idx) => {
      if (v === null || v === undefined) return;
      const x = xPos(idx);
      const y = yPos(v);
      html += `<circle cx="${x}" cy="${y}" r="3.5" fill="${s.color}" />`;
      html += `<text x="${x}" y="${y - 8}" text-anchor="middle" fill="${s.color}" font-size="11">${v}</text>`;
    });
  });

  series.forEach((s, idx) => {
    const lx = padding.left + idx * 130;
    const ly = 14;
    html += `<line x1="${lx}" y1="${ly}" x2="${lx + 20}" y2="${ly}" stroke="${s.color}" stroke-width="3" />`;
    html += `<text x="${lx + 25}" y="${ly + 4}" fill="#374151" font-size="12">${s.label}</text>`;
  });

  svgEl.innerHTML = html;
}

function renderCharts() {
  const ordered = [...state.summary].sort((a, b) => a.date.localeCompare(b.date));
  const labels = ordered.map((x) => x.date);
  drawLineChart(upDownChartEl, labels, [
    { label: "上涨家数", color: "#dc2626", values: ordered.map((x) => x.up_count) },
    { label: "下跌家数", color: "#2563eb", values: ordered.map((x) => x.down_count) }
  ]);
  drawLineChart(limitChartEl, labels, [
    { label: "涨停家数", color: "#be123c", values: ordered.map((x) => x.limit_up_count) },
    { label: "跌停家数", color: "#1d4ed8", values: ordered.map((x) => x.limit_down_count) }
  ]);
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
  stats.forEach((item, idx) => {
    const el = document.createElement("article");
    el.className = "reason-item";
    const tag = idx < 3 ? " (Top3)" : "";
    el.innerHTML = `<p class="reason-name">${item.reason}${tag}</p><p>家数：${item.count}</p>`;
    reasonStatsEl.appendChild(el);
  });
}

function renderReasonFilter(date) {
  const rows = state.detailsByDate[date] || [];
  const stats = buildReasonStats(rows);
  const allReasons = stats.map((x) => x.reason);
  const reasons = top3OnlyEl.checked ? ["全部", ...allReasons.slice(0, 3)] : ["全部", ...allReasons];
  const prev = reasonFilterEl.value;
  reasonFilterEl.innerHTML = reasons.map((r) => `<option value="${r}">${r}</option>`).join("");
  reasonFilterEl.value = reasons.includes(prev) ? prev : "全部";
}

function renderTable() {
  const date = dateFilterTableEl.value;
  const reason = reasonFilterEl.value;
  const top3Reasons = getTop3Reasons(date);
  let rows = (state.detailsByDate[date] || []).filter((row) => {
    const tags = splitReasonTags(row.reason);
    if (top3OnlyEl.checked && !tags.some((x) => top3Reasons.includes(x))) return false;
    if (reason === "全部") return true;
    return tags.includes(reason);
  });
  rows = rows.sort((a, b) => {
    const compared = compareByKey(a, b, state.sort.key);
    return state.sort.dir === "asc" ? compared : -compared;
  });

  detailTableBodyEl.innerHTML = "";
  if (!rows.length) {
    detailTableBodyEl.innerHTML = `<tr><td colspan="7" class="muted">没有匹配数据</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
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
  top3OnlyEl.addEventListener("change", () => {
    renderReasonFilter(dateFilterTableEl.value);
    renderTable();
  });
  refreshBtnEl.addEventListener("click", loadData);
  sortableHeaderEls.forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.getAttribute("data-sort-key");
      if (!key) return;
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
      } else {
        state.sort.key = key;
        state.sort.dir = "desc";
      }
      renderTable();
    });
  });
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  refreshBtnEl.disabled = true;
  refreshBtnEl.textContent = "刷新中...";
  try {
    const dataUrl = `data/latest.json?t=${Date.now()}`;
    const res = await fetch(dataUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    state.summary = data.summary || [];
    state.detailsByDate = data.limit_up_details_by_date || {};
    generatedAtEl.textContent = `数据更新时间：${data.generated_at || "-"}`;

    renderSummary();
    renderCharts();

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
  } catch (err) {
    generatedAtEl.textContent = "数据加载失败，请检查 data/latest.json 是否存在。";
    console.error(err);
  } finally {
    state.loading = false;
    refreshBtnEl.disabled = false;
    refreshBtnEl.textContent = "手动刷新数据";
  }
}

bindEvents();
loadData();
