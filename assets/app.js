const generatedAtEl = document.getElementById("generatedAt");
const refreshBtnEl = document.getElementById("refreshBtn");
const limitChartEl = document.getElementById("limitChart");
const upDownChartEl = document.getElementById("upDownChart");
const tabBarEl = document.getElementById("tabBar");
const tabContentEl = document.getElementById("tabContent");

const SLOT_COLORS = [
  "#e60012",
  "#ff7a00",
  "#1890ff",
  "#722ed1",
  "#52c41a",
  "#13c2c2",
  "#eb2f96",
  "#fa8c16",
  "#2f54eb",
  "#a0d911"
];

const CONCEPT_RULES = [
  { concept: "算力", keywords: ["算力", "服务器", "AIDC", "数据中心", "东数西算", "液冷"] },
  { concept: "通信", keywords: ["通信", "光模块", "光通信", "光纤", "CPO", "5G", "卫星"] },
  { concept: "芯片", keywords: ["芯片", "半导体", "集成电路", "SiC", "IGBT"] },
  { concept: "机器人", keywords: ["机器人", "自动化", "人形机器人"] },
  { concept: "医药", keywords: ["医药", "创新药", "制药", "原料药", "医疗"] },
  { concept: "新能源", keywords: ["储能", "光伏", "风电", "锂电", "固态电池", "充电"] },
  { concept: "汽车", keywords: ["汽车", "智驾", "无人驾驶", "车路协同", "汽配"] },
  { concept: "化工", keywords: ["化工", "化学", "化纤", "农药", "染料", "新材料"] },
  { concept: "国企改革", keywords: ["国企", "央企", "国资"] },
  { concept: "其他", keywords: [] }
];

const state = {
  generatedAt: "",
  summary: [],
  detailsByDate: {},
  activeDate: "",
  loading: false,
  tableSortByDateConcept: {}
};

function toYi(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return (n / 1e8).toFixed(2);
}

function normalizeTime(time) {
  if (!time) return "-";
  const text = String(time).trim();
  if (!text) return "-";
  if (text.length >= 5) return text.slice(0, 5);
  return text;
}

function parseTimeNumber(time) {
  const text = String(time || "");
  const parts = text.split(":").map((x) => Number(x));
  if (parts.length < 2 || parts.some((x) => Number.isNaN(x))) return -1;
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

function getMarketPrefix(code) {
  const t = String(code || "");
  if (t.startsWith("6") || t.startsWith("9")) return "SH";
  return "SZ";
}

function stockLink(code) {
  const codeText = String(code || "");
  if (!codeText) return "#";
  const prefix = getMarketPrefix(codeText).toLowerCase();
  return `https://quote.eastmoney.com/concept/${prefix}${codeText}.html`;
}

function splitReasonTags(reason) {
  if (!reason) return [];
  return String(reason)
    .split(/[+,，、;；|/\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeReasonTag(tag) {
  const lower = String(tag || "").toLowerCase();
  for (const rule of CONCEPT_RULES) {
    if (rule.keywords.some((kw) => lower.includes(String(kw).toLowerCase()))) {
      return rule.concept;
    }
  }
  return tag || "其他";
}

function getConcepts(row) {
  const tags = splitReasonTags(row.reason);
  if (!tags.length) return ["其他"];
  const merged = new Set();
  for (const tag of tags) merged.add(mergeReasonTag(tag));
  return [...merged];
}

function getPrimaryConcept(row) {
  return getConcepts(row)[0] || "其他";
}

function groupByConcept(rows) {
  const groups = {};
  for (const row of rows) {
    const concepts = getConcepts(row);
    for (const concept of concepts) {
      if (!groups[concept]) groups[concept] = [];
      groups[concept].push(row);
    }
  }
  return Object.entries(groups)
    .map(([name, list]) => ({
      concept: name,
      rows: list,
      count: list.length,
      amount: list.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount);
}

function sortRows(rows, sortState) {
  const list = [...rows];
  const dirMul = sortState.dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    if (sortState.key === "amount") {
      return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dirMul;
    }
    if (sortState.key === "time") {
      return (parseTimeNumber(a.first_limit_up_time) - parseTimeNumber(b.first_limit_up_time)) * dirMul;
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "zh-CN") * dirMul;
  });
  return list;
}

function drawLineChart(svgEl, labels, series) {
  const width = 620;
  const height = 280;
  const padding = { top: 20, right: 20, bottom: 40, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values).filter((x) => Number.isFinite(x));
  if (!allValues.length) {
    svgEl.innerHTML = '<text x="20" y="40" fill="#6b7280" font-size="14">暂无可绘制数据</text>';
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
  html += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerH}" stroke="#d9d9d9" />`;
  html += `<line x1="${padding.left}" y1="${padding.top + innerH}" x2="${padding.left + innerW}" y2="${padding.top + innerH}" stroke="#d9d9d9" />`;

  labels.forEach((label, idx) => {
    html += `<text x="${xPos(idx)}" y="${height - 12}" text-anchor="middle" fill="#8c8c8c" font-size="12">${String(label).slice(5)}</text>`;
  });

  series.forEach((s) => {
    const points = s.values
      .map((v, idx) => (Number.isFinite(v) ? `${xPos(idx)},${yPos(v)}` : null))
      .filter(Boolean)
      .join(" ");
    html += `<polyline fill="none" stroke="${s.color}" stroke-width="2.6" points="${points}" />`;
    s.values.forEach((v, idx) => {
      if (!Number.isFinite(v)) return;
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
    html += `<text x="${lx + 25}" y="${ly + 4}" fill="#595959" font-size="12">${s.label}</text>`;
  });

  svgEl.innerHTML = html;
}

function renderCharts() {
  const ordered = [...state.summary].sort((a, b) => a.date.localeCompare(b.date));
  const labels = ordered.map((x) => x.date);

  drawLineChart(limitChartEl, labels, [
    { label: "涨停家数", color: "#e60012", values: ordered.map((x) => Number(x.limit_up_count)) },
    { label: "跌停家数", color: "#13c2c2", values: ordered.map((x) => Number(x.limit_down_count)) }
  ]);

  drawLineChart(upDownChartEl, labels, [
    { label: "上涨家数", color: "#e60012", values: ordered.map((x) => Number(x.up_count)) },
    { label: "下跌家数", color: "#52c41a", values: ordered.map((x) => Number(x.down_count)) }
  ]);
}

function findSummary(date) {
  return state.summary.find((x) => x.date === date) || {};
}

function renderTabs() {
  tabBarEl.innerHTML = "";
  state.summary.forEach((item, idx) => {
    const btn = document.createElement("button");
    btn.className = `tab-btn${state.activeDate === item.date ? " active" : ""}`;
    btn.type = "button";
    btn.dataset.date = item.date;
    btn.innerHTML = `${item.date}<span style="font-size:11px;opacity:.75"> ${item.limit_up_count ?? "-"}只</span>`;
    btn.addEventListener("click", () => {
      state.activeDate = item.date;
      renderTabs();
      renderActivePanel();
    });
    if (!state.activeDate && idx === 0) state.activeDate = item.date;
    tabBarEl.appendChild(btn);
  });
}

function renderStatsCards(summary, rows) {
  const totalAmountYi = rows.reduce((sum, x) => sum + (Number(x.amount) || 0), 0) / 1e8;
  return `
    <section class="stats">
      <article class="stat-card"><div class="stat-num up">${summary.up_count ?? "-"}</div><div class="stat-label">上涨家数</div></article>
      <article class="stat-card"><div class="stat-num down">${summary.down_count ?? "-"}</div><div class="stat-label">下跌家数</div></article>
      <article class="stat-card"><div class="stat-num up">${summary.limit_up_count ?? "-"}</div><div class="stat-label">涨停家数</div></article>
      <article class="stat-card"><div class="stat-num cyan">${summary.limit_down_count ?? "-"}</div><div class="stat-label">跌停家数</div></article>
      <article class="stat-card"><div class="stat-num">${rows.length}</div><div class="stat-label">涨停明细数</div></article>
      <article class="stat-card"><div class="stat-num" style="font-size:20px">${totalAmountYi.toFixed(2)}<span style="font-size:13px">亿</span></div><div class="stat-label">总成交额</div></article>
    </section>
  `;
}

function renderTagCloud(groups) {
  const tags = groups.slice(0, 10).map((group, idx) => {
    const color = SLOT_COLORS[idx % SLOT_COLORS.length];
    const size = Math.max(13, Math.min(20, 12 + group.count));
    return `<span class="hot-tag" style="font-size:${size}px;color:${color};border-color:${color}40;background:${color}12">${group.concept} (${group.count})</span>`;
  });
  return `
    <section>
      <h2 class="section-title">热门涨停概念</h2>
      <div class="tag-cloud-wrap">${tags.join("") || "暂无概念数据"}</div>
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

function renderConceptTable(group, date, idx) {
  const color = SLOT_COLORS[idx % SLOT_COLORS.length];
  const sortState = sortStateFor(date, group.concept);
  const rows = sortRows(group.rows, sortState);

  const tableRows = rows
    .map((row, i) => {
      const code = String(row.code || "");
      const market = getMarketPrefix(code);
      const firstTime = normalizeTime(row.first_limit_up_time);
      const lastTime = normalizeTime(row.last_limit_up_time);
      return `
        <tr>
          <td class="idx-col">${i + 1}</td>
          <td class="name-col">
            <div><a class="name-link" href="${stockLink(code)}" target="_blank" rel="noreferrer">${row.name || "-"}</a></div>
            <div class="code-text">${market}${code}</div>
          </td>
          <td>${toYi(row.amount)}</td>
          <td>${row.turnover_rate ?? "-"}</td>
          <td>${firstTime}</td>
          <td>${lastTime}</td>
          <td>${row.consecutive_boards ?? "-"}</td>
          <td>${row.reason || "-"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <article class="concept-card" data-concept="${group.concept}">
      <header class="concept-head" style="border-left-color:${color};background:${color}12;">
        <span style="color:${color}">${group.concept}</span>
        <span class="concept-meta">${group.count}只 | 成交额 ${toYi(group.amount)}亿</span>
      </header>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="idx-col">序号</th>
              <th>名称/代码</th>
              <th class="sort-th" data-date="${date}" data-concept="${group.concept}" data-sort-key="amount">成交额(亿)</th>
              <th>换手率(%)</th>
              <th class="sort-th" data-date="${date}" data-concept="${group.concept}" data-sort-key="time">首封时间</th>
              <th>末封时间</th>
              <th>连板数</th>
              <th>涨停原因</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderActivePanel() {
  const date = state.activeDate;
  const summary = findSummary(date);
  const rows = state.detailsByDate[date] || [];
  const groups = groupByConcept(rows);

  let html = "";
  html += renderStatsCards(summary, rows);
  html += renderTagCloud(groups);
  html += '<section><h2 class="section-title">按概念分类详情</h2>';
  html += groups.map((group, idx) => renderConceptTable(group, date, idx)).join("");
  html += `<p class="note">数据源：data/latest.json | 生成时间：${state.generatedAt || "-"}</p>`;
  html += "</section>";
  tabContentEl.innerHTML = html;

  bindSortEvents();
}

function bindSortEvents() {
  tabContentEl.querySelectorAll(".sort-th").forEach((th) => {
    th.addEventListener("click", () => {
      const date = th.dataset.date;
      const concept = th.dataset.concept;
      const key = th.dataset.sortKey;
      const stateRef = sortStateFor(date, concept);
      if (stateRef.key === key) {
        stateRef.dir = stateRef.dir === "desc" ? "asc" : "desc";
      } else {
        stateRef.key = key;
        stateRef.dir = "desc";
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
    const url = `data/latest.json?t=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.generatedAt = data.generated_at || "";
    state.summary = (data.summary || []).map((x) => ({ ...x }));
    state.detailsByDate = data.limit_up_details_by_date || {};
    if (!state.activeDate && state.summary.length) {
      state.activeDate = state.summary[0].date;
    }
    if (state.activeDate && !state.summary.some((x) => x.date === state.activeDate)) {
      state.activeDate = state.summary[0]?.date || "";
    }

    generatedAtEl.textContent = `数据更新时间：${state.generatedAt || "-"}`;
    renderCharts();
    renderTabs();
    renderActivePanel();
  } catch (error) {
    generatedAtEl.textContent = "数据加载失败，请检查 data/latest.json 是否存在";
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
loadData();
