const generatedAtEl = document.getElementById("generatedAt");
const refreshBtnEl = document.getElementById("refreshBtn");
const limitChartEl = document.getElementById("limitChart");
const upDownChartEl = document.getElementById("updownChart");
const tabBarEl = document.getElementById("tabBar");
const tabContentEl = document.getElementById("tabContent");

let limitChartIns = null;
let upDownChartIns = null;

const SLOT_COLORS = ["#e60012", "#ff7a00", "#1890ff", "#52c41a", "#fa8c16", "#722ed1", "#13c2c2", "#eb2f96"];

const state = {
  generatedAt: "",
  latestTradeDate: "",
  summary: [],
  detailsByDate: {},
  conceptGroupsByDate: {},
  activeDate: "",
  loading: false,
  tableSortByDateConcept: {},
  hotConceptsGeneratedAt: "",
  hotConceptsLatestTradeDate: "",
  hotConceptsTop: [],
  hotConceptsAllCount: 0,
  hotConceptsMethod: null
};

function toYi(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return (n / 1e8).toFixed(2);
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function formatScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function normalizeTime(time) {
  if (!time) return "-";
  const text = String(time).trim();
  if (!text) return "-";
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function parseTimeNumber(time) {
  const parts = String(time || "")
    .split(":")
    .map((item) => Number(item));
  if (parts.length < 2 || parts.some((item) => Number.isNaN(item))) return -1;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function getMarketPrefix(code) {
  const text = String(code || "");
  if (text.startsWith("6") || text.startsWith("9")) return "SH";
  if (text.startsWith("8") || text.startsWith("4")) return "BJ";
  return "SZ";
}

function stockLink(code) {
  const codeText = String(code || "");
  if (!codeText) return "#";
  const prefix = getMarketPrefix(codeText).toLowerCase();
  return `https://quote.eastmoney.com/concept/${prefix}${codeText}.html`;
}

function findSummary(date) {
  return state.summary.find((item) => item.date === date) || {};
}

function getRowsByDate(date) {
  return state.detailsByDate[date] || [];
}

function getConceptGroupsByDate(date) {
  return state.conceptGroupsByDate[date] || [];
}

function getHotConceptBoards(date) {
  if (date !== state.hotConceptsLatestTradeDate) return [];
  return state.hotConceptsTop || [];
}

function sortRows(rows, sortState) {
  const list = [...rows];
  const dirMul = sortState.dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    if (sortState.key === "amount") {
      return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dirMul;
    }
    if (sortState.key === "turnover_rate") {
      return ((Number(a.turnover_rate) || 0) - (Number(b.turnover_rate) || 0)) * dirMul;
    }
    if (sortState.key === "first_time") {
      return (parseTimeNumber(a.first_limit_up_time) - parseTimeNumber(b.first_limit_up_time)) * dirMul;
    }
    if (sortState.key === "last_time") {
      return (parseTimeNumber(a.last_limit_up_time) - parseTimeNumber(b.last_limit_up_time)) * dirMul;
    }
    if (sortState.key === "boards") {
      return ((Number(a.consecutive_boards) || 0) - (Number(b.consecutive_boards) || 0)) * dirMul;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN") * dirMul;
  });
  return list;
}

function renderCharts() {
  if (!window.echarts) {
    limitChartEl.innerHTML = '<div class="note">未加载 ECharts</div>';
    upDownChartEl.innerHTML = '<div class="note">未加载 ECharts</div>';
    return;
  }

  const ordered = [...state.summary].sort((a, b) => a.date.localeCompare(b.date));
  const labels = ordered.map((item) => item.date);
  const limitUp = ordered.map((item) => Number(item.limit_up_count) || 0);
  const limitDown = ordered.map((item) => Number(item.limit_down_count) || 0);
  const up = ordered.map((item) => Number(item.up_count) || 0);
  const down = ordered.map((item) => Number(item.down_count) || 0);

  if (!limitChartIns) limitChartIns = window.echarts.init(limitChartEl);
  if (!upDownChartIns) upDownChartIns = window.echarts.init(upDownChartEl);

  limitChartIns.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { data: ["涨停家数", "跌停家数"], bottom: 0 },
    grid: { left: "3%", right: "4%", bottom: "12%", top: "8%", containLabel: true },
    xAxis: { type: "category", data: labels, axisLabel: { fontSize: 13, fontWeight: "bold" } },
    yAxis: { type: "value", name: "家数", axisLabel: { fontSize: 12 } },
    series: [
      {
        name: "涨停家数",
        type: "line",
        data: limitUp,
        smooth: true,
        symbol: "circle",
        symbolSize: 10,
        lineStyle: { width: 3, color: "#e60012" },
        itemStyle: { color: "#e60012" },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(230,0,18,0.25)" },
            { offset: 1, color: "rgba(230,0,18,0.02)" }
          ])
        }
      },
      {
        name: "跌停家数",
        type: "line",
        data: limitDown,
        smooth: true,
        symbol: "circle",
        symbolSize: 10,
        lineStyle: { width: 3, color: "#13c2c2" },
        itemStyle: { color: "#13c2c2" },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(19,194,194,0.2)" },
            { offset: 1, color: "rgba(19,194,194,0.02)" }
          ])
        }
      }
    ]
  });

  upDownChartIns.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { data: ["上涨家数", "下跌家数"], bottom: 0 },
    grid: { left: "3%", right: "4%", bottom: "12%", top: "8%", containLabel: true },
    xAxis: { type: "category", data: labels, axisLabel: { fontSize: 13, fontWeight: "bold" } },
    yAxis: { type: "value", name: "家数", axisLabel: { fontSize: 12 } },
    series: [
      {
        name: "上涨家数",
        type: "line",
        data: up,
        smooth: true,
        symbol: "diamond",
        symbolSize: 10,
        lineStyle: { width: 3, color: "#e60012" },
        itemStyle: { color: "#e60012", borderColor: "#fff", borderWidth: 2 },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(230,0,18,0.18)" },
            { offset: 1, color: "rgba(230,0,18,0.02)" }
          ])
        }
      },
      {
        name: "下跌家数",
        type: "line",
        data: down,
        smooth: true,
        symbol: "diamond",
        symbolSize: 10,
        lineStyle: { width: 3, color: "#52c41a" },
        itemStyle: { color: "#52c41a", borderColor: "#fff", borderWidth: 2 },
        areaStyle: {
          color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(82,196,26,0.15)" },
            { offset: 1, color: "rgba(82,196,26,0.02)" }
          ])
        }
      }
    ]
  });
}

function renderTabs() {
  tabBarEl.innerHTML = "";
  state.summary.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn${state.activeDate === item.date ? " active" : ""}`;
    btn.type = "button";
    btn.dataset.date = item.date;
    btn.innerHTML = `${item.date}<span class="tab-meta">${item.limit_up_count ?? "-"}板</span>`;
    btn.addEventListener("click", () => {
      state.activeDate = item.date;
      renderTabs();
      renderActivePanel();
    });
    if (!state.activeDate && idx === 0) state.activeDate = item.date;
    tabBarEl.appendChild(btn);
  });
}

function renderStatsCards(summary, rows, groups, hotBoards) {
  const totalAmountYi = rows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) / 1e8;
  const boardLimitUps = hotBoards.reduce((sum, item) => sum + (Number(item.limit_up_count) || 0), 0);
  return `
    <section class="stats">
      <article class="stat-card"><div class="num" style="color:#e60012">${summary.up_count ?? "-"}</div><div class="label">上涨家数</div></article>
      <article class="stat-card"><div class="num" style="color:#52c41a">${summary.down_count ?? "-"}</div><div class="label">下跌家数</div></article>
      <article class="stat-card"><div class="num" style="color:#ff4d4f">${summary.limit_up_count ?? "-"}</div><div class="label">涨停家数</div></article>
      <article class="stat-card"><div class="num" style="color:#13c2c2">${summary.limit_down_count ?? "-"}</div><div class="label">跌停家数</div></article>
      <article class="stat-card"><div class="num">${hotBoards.length || groups.length}</div><div class="label">${hotBoards.length ? "热门板块数" : "涨停概念数"}</div></article>
      <article class="stat-card"><div class="num" style="color:#722ed1;font-size:20px">${hotBoards.length ? boardLimitUps : totalAmountYi.toFixed(2)}<span class="unit">${hotBoards.length ? "只" : "亿"}</span></div><div class="label">${hotBoards.length ? "热门板块涨停股" : "涨停成交额"}</div></article>
    </section>
  `;
}

function renderHotBoardSummary(date, hotBoards) {
  if (!hotBoards.length) return "";

  const rows = hotBoards
    .map((item) => {
      return `
        <tr>
          <td class="idx-col">${item.rank}</td>
          <td>
            <div class="board-name">${item.name || "-"}</div>
            <div class="code-text">概念代码 ${item.concept_code || "-"} / 板块代码 ${item.plate_code || "-"}</div>
          </td>
          <td class="score-text">${formatScore(item.heat_score)}</td>
          <td class="up-text">${formatPct(item.change_pct)}%</td>
          <td>${item.net_inflow_yi == null ? "-" : `${formatPct(item.net_inflow_yi)} 亿`}</td>
          <td>${item.limit_up_count ?? 0}</td>
        </tr>
      `;
    })
    .join("");

  const method = state.hotConceptsMethod?.formula || "-";
  return `
    <section>
      <div class="section-head">
        <h2 class="section-title">热门板块前 ${hotBoards.length}</h2>
        <div class="section-sub">交易日 ${date} | 全量概念 ${state.hotConceptsAllCount || 0} | 评分公式 ${method}</div>
      </div>
      <div class="table-wrap board-summary-wrap">
        <table>
          <thead>
            <tr>
              <th class="idx-col">排名</th>
              <th>热门板块</th>
              <th>Heat Score</th>
              <th>涨幅</th>
              <th>资金流向</th>
              <th>涨停数</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderHotConcepts(groups, date, hotBoards) {
  if (hotBoards.length) {
    const tags = hotBoards.map((group, idx) => {
      const color = SLOT_COLORS[idx % SLOT_COLORS.length];
      return `<span class="hot-tag" style="color:${color};border-color:${color}40;background:${color}12">${group.name} | ${formatScore(group.heat_score)} | ${group.limit_up_count}涨停</span>`;
    });

    return `
      <section>
        <div class="section-head">
          <h2 class="section-title">热门板块热度分布</h2>
          <div class="section-sub">按公开网页字段推导的概念热度前10</div>
        </div>
        <div class="tag-cloud-wrap">${tags.join("")}</div>
      </section>
    `;
  }

  if (!groups.length) {
    return `
      <section>
        <h2 class="section-title">涨停概念分布</h2>
        <div class="empty-block">暂无概念分组数据</div>
      </section>
    `;
  }

  const tags = groups.slice(0, 24).map((group, idx) => {
    const color = SLOT_COLORS[idx % SLOT_COLORS.length];
    const suffix =
      date === state.latestTradeDate && Number.isFinite(Number(group.change_pct))
        ? ` | ${formatPct(group.change_pct)}%`
        : "";
    return `<span class="hot-tag" style="color:${color};border-color:${color}40;background:${color}12">${group.concept} (${group.count})${suffix}</span>`;
  });

  return `
    <section>
      <div class="section-head">
        <h2 class="section-title">涨停概念分布</h2>
        <div class="section-sub">按同花顺概念归类涨停个股</div>
      </div>
      <div class="tag-cloud-wrap">${tags.join("")}</div>
    </section>
  `;
}

function sortStateFor(date, concept) {
  const key = `${date}::${concept}`;
  if (!state.tableSortByDateConcept[key]) {
    state.tableSortByDateConcept[key] = { key: "amount", dir: "desc" };
  }
  return state.tableSortByDateConcept[key];
}

function renderConceptTable(group, date, idx, hotMode) {
  const color = SLOT_COLORS[idx % SLOT_COLORS.length];
  const conceptLabel = hotMode ? group.name : group.concept;
  const rows = hotMode ? group.limit_up_stocks || [] : group.rows || [];
  const sortState = sortStateFor(date, conceptLabel);
  const sortedRows = sortRows(rows, sortState);

  const tableRows = sortedRows
    .map((row, i) => {
      const code = String(row.code || "");
      return `
        <tr>
          <td class="idx-col">${i + 1}</td>
          <td class="name-col">
            <div><a class="name-link" href="${stockLink(code)}" target="_blank" rel="noreferrer">${row.name || "-"}</a></div>
            <div class="code-text">${getMarketPrefix(code)}${code}</div>
          </td>
          <td>${toYi(row.amount)}</td>
          <td>${formatPct(row.turnover_rate)}</td>
          <td>${normalizeTime(row.first_limit_up_time)}</td>
          <td>${normalizeTime(row.last_limit_up_time)}</td>
          <td>${row.consecutive_boards ?? "-"}</td>
          <td>${row.reason || "-"}</td>
        </tr>
      `;
    })
    .join("");

  const metaItems = hotMode
    ? [
        `Heat ${formatScore(group.heat_score)}`,
        `资金流向 ${group.net_inflow_yi == null ? "-" : `${formatPct(group.net_inflow_yi)} 亿`}`,
        `涨幅 ${formatPct(group.change_pct)}%`,
        `涨停 ${group.limit_up_count ?? 0}`
      ]
    : [`涨停 ${group.count}`];

  if (!hotMode && group.amount) metaItems.push(`成交额 ${toYi(group.amount)} 亿`);
  if (!hotMode && date === state.latestTradeDate && Number.isFinite(Number(group.change_pct))) {
    metaItems.push(`今日涨幅 ${formatPct(group.change_pct)}%`);
  }

  return `
    <article class="card" data-concept="${conceptLabel}">
      <header class="card-head" style="border-left:4px solid ${color};background:${color}12;">
        <span style="color:${color}">${conceptLabel}</span>
        <span class="concept-meta">${metaItems.join(" | ")}</span>
      </header>
      ${hotMode ? `
        <div class="metric-strip">
          <span class="metric-pill"><strong>Heat Score</strong>${formatScore(group.heat_score)}</span>
          <span class="metric-pill"><strong>资金流向</strong>${group.net_inflow_yi == null ? "-" : `${formatPct(group.net_inflow_yi)} 亿`}</span>
          <span class="metric-pill"><strong>涨停数</strong>${group.limit_up_count ?? 0}</span>
          <span class="metric-pill"><strong>涨幅</strong>${formatPct(group.change_pct)}%</span>
        </div>
      ` : ""}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="idx-col">序号</th>
              <th>名称/代码</th>
              <th class="sort-th" data-dir="${sortState.key === "amount" ? sortState.dir : ""}" data-date="${date}" data-concept="${conceptLabel}" data-sort-key="amount">成交额(亿)<span class="sort-arrow"></span></th>
              <th class="sort-th" data-dir="${sortState.key === "turnover_rate" ? sortState.dir : ""}" data-date="${date}" data-concept="${conceptLabel}" data-sort-key="turnover_rate">换手率(%)<span class="sort-arrow"></span></th>
              <th class="sort-th" data-dir="${sortState.key === "first_time" ? sortState.dir : ""}" data-date="${date}" data-concept="${conceptLabel}" data-sort-key="first_time">首封时间<span class="sort-arrow"></span></th>
              <th class="sort-th" data-dir="${sortState.key === "last_time" ? sortState.dir : ""}" data-date="${date}" data-concept="${conceptLabel}" data-sort-key="last_time">末封时间<span class="sort-arrow"></span></th>
              <th class="sort-th" data-dir="${sortState.key === "boards" ? sortState.dir : ""}" data-date="${date}" data-concept="${conceptLabel}" data-sort-key="boards">连板数<span class="sort-arrow"></span></th>
              <th>涨停原因</th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="8" class="empty-row">暂无涨停个股</td></tr>'}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderActivePanel() {
  const date = state.activeDate;
  const summary = findSummary(date);
  const rows = getRowsByDate(date);
  const groups = getConceptGroupsByDate(date);
  const hotBoards = getHotConceptBoards(date);
  const useHotBoards = hotBoards.length > 0;

  let html = "";
  html += renderStatsCards(summary, rows, groups, hotBoards);
  html += renderHotBoardSummary(date, hotBoards);
  html += renderHotConcepts(groups, date, hotBoards);
  html += `<section><h2 class="section-title">${useHotBoards ? "按热门板块展示涨停个股" : "按概念分类详情"}</h2>`;
  html += (useHotBoards ? hotBoards : groups).map((group, idx) => renderConceptTable(group, date, idx, useHotBoards)).join("");
  html += `<p class="note">数据源: data/site/latest.json${useHotBoards ? " + data/site/hot_concepts.json" : ""} | 生成时间: ${state.generatedAt || "-"}${state.hotConceptsGeneratedAt ? ` / 热门板块: ${state.hotConceptsGeneratedAt}` : ""}</p>`;
  html += "</section>";
  tabContentEl.innerHTML = html;

  bindSortEvents();
}

function bindSortEvents() {
  tabContentEl.querySelectorAll(".sort-th").forEach((th) => {
    th.addEventListener("click", () => {
      const { date, concept, sortKey } = th.dataset;
      const sortState = sortStateFor(date, concept);
      if (sortState.key === sortKey) {
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      } else {
        sortState.key = sortKey;
        sortState.dir = "desc";
      }
      renderActivePanel();
    });
  });
}

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  refreshBtnEl.disabled = true;
  refreshBtnEl.textContent = "刷新中...";

  try {
    const [latestResponse, hotConceptResponse] = await Promise.all([
      fetch(`data/site/latest.json?t=${Date.now()}`),
      fetch(`data/site/hot_concepts.json?t=${Date.now()}`)
    ]);

    if (!latestResponse.ok) throw new Error(`data/site/latest.json HTTP ${latestResponse.status}`);
    if (!hotConceptResponse.ok) throw new Error(`data/site/hot_concepts.json HTTP ${hotConceptResponse.status}`);

    const [data, hotConceptData] = await Promise.all([
      latestResponse.json(),
      hotConceptResponse.json()
    ]);

    state.generatedAt = data.generated_at || "";
    state.latestTradeDate = data.latest_trade_date || "";
    state.summary = (data.summary || []).map((item) => ({ ...item }));
    state.detailsByDate = data.limit_up_details_by_date || {};
    state.conceptGroupsByDate = data.limit_up_concepts_by_date || {};

    state.hotConceptsGeneratedAt = hotConceptData.generated_at || "";
    state.hotConceptsLatestTradeDate = hotConceptData.latest_trade_date || "";
    state.hotConceptsTop = hotConceptData.top_concepts || [];
    state.hotConceptsAllCount = hotConceptData.all_count || 0;
    state.hotConceptsMethod = hotConceptData.method || null;

    if (!state.activeDate && state.summary.length) {
      state.activeDate = state.summary[0].date;
    }
    if (state.activeDate && !state.summary.some((item) => item.date === state.activeDate)) {
      state.activeDate = state.summary[0]?.date || "";
    }

    generatedAtEl.textContent = `数据更新时间: ${state.generatedAt || "-"}${state.hotConceptsGeneratedAt ? ` | 热门板块: ${state.hotConceptsGeneratedAt}` : ""}`;
    renderCharts();
    renderTabs();
    renderActivePanel();
  } catch (error) {
    generatedAtEl.textContent = "数据加载失败，请检查 data/site/latest.json 和 data/site/hot_concepts.json 是否存在";
    tabBarEl.innerHTML = "";
    tabContentEl.innerHTML = "";
    console.error(error);
  } finally {
    state.loading = false;
    refreshBtnEl.disabled = false;
    refreshBtnEl.textContent = "刷新数据";
  }
}

refreshBtnEl.addEventListener("click", loadData);
window.addEventListener("resize", () => {
  if (limitChartIns) limitChartIns.resize();
  if (upDownChartIns) upDownChartIns.resize();
});

loadData();
