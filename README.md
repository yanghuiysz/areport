# A股涨停看板

这是一个静态页面项目，用来展示最近 3 个交易日的市场概览，并在最新交易日按热门板块维度展示涨停个股。

## 当前功能

- 最近 3 个交易日的上涨 / 下跌家数
- 最近 3 个交易日的涨停 / 跌停家数
- 最新交易日的热门板块前 10
- 每个热门板块的 `heat_score`、资金流向、涨停数、涨幅
- 每个热门板块下对应的涨停个股明细

## 目录结构

```text
.
├─ index.html
├─ assets/
│  ├─ app.js
│  └─ styles.css
├─ data/
│  └─ site/
│     ├─ latest.json
│     └─ hot_concepts.json
├─ scripts/
│  ├─ build_site_data.py
│  ├─ fetch_data.py
│  ├─ fetch_hot_concepts.py
│  └─ lib/
│     ├─ hot_concepts.py
│     ├─ market_data.py
│     └─ site_paths.py
└─ .github/workflows/
```

## 数据流

1. `scripts/fetch_data.py` 生成 `data/site/latest.json`
2. `scripts/fetch_hot_concepts.py` 生成 `data/site/hot_concepts.json`
3. `scripts/build_site_data.py` 作为统一入口，顺序执行上面两步
4. 前端从 `data/site/` 读取 JSON 渲染页面

## 本地运行

安装依赖：

```bash
pip install -r requirements.txt
```

生成页面数据：

```bash
python -m scripts.build_site_data
```

启动静态服务预览：

```bash
python -m http.server
```

## GitHub Actions

工作流文件在 [update-data.yml](D:\github\areport\.github\workflows\update-data.yml)。

默认行为：

- 工作日定时更新
- 支持手动触发
- 统一执行 `python -m scripts.build_site_data`
- 自动提交 `data/site/` 下的新数据

## 说明

- 热门板块不是同花顺官方原始热榜分数，而是基于公开网页字段计算的近似综合热度
- 页面会在最新交易日优先显示热门板块视角，历史交易日仍保留按概念分组的涨停明细
