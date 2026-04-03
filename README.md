# A 股涨停数据看板（GitHub Pages）

这是一个可直接部署到 GitHub Pages 的静态页面，用于展示最近 3 个交易日的：

- 涨跌家数
- 涨停 / 跌停家数
- 涨停个股明细（涨停原因、成交额、换手率、首封/末封时间、连板数）
- 按涨停原因分类统计与筛选

说明：涨停/跌停与涨停明细按交易日抓取；“上涨家数/下跌家数”目前由公开快照源提供，通常仅当日稳定，历史日期可能为空。

## 目录结构

- `index.html`: 页面入口
- `assets/app.js`: 前端逻辑
- `assets/styles.css`: 页面样式
- `data/latest.json`: 前端读取的数据文件（由脚本自动更新）
- `scripts/fetch_data.py`: 抓取并生成 `data/latest.json`
- `.github/workflows/update-data.yml`: 自动更新数据的 GitHub Actions

## 本地运行

1. 安装依赖：
```bash
pip install -r requirements.txt
```
2. 更新数据：
```bash
python scripts/fetch_data.py
```
3. 启动任意静态服务器预览（例如 `python -m http.server`）。

## GitHub Pages 部署

1. 推送仓库到 GitHub。
2. 进入仓库 `Settings -> Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. 分支选择 `main`，目录选择 `/ (root)`。
5. 保存后等待页面发布。

## 自动更新数据

工作流文件已配置：

- 每个工作日自动执行（北京时间晚间，收盘后）
- 支持 `Actions` 页面手动触发

首次启用时请确认仓库允许 Actions 写入：

- `Settings -> Actions -> General -> Workflow permissions`
- 选择 `Read and write permissions`

## 绑定自定义域名

1. 在 `Settings -> Pages` 填写自定义域名。
2. 在域名服务商处添加 CNAME 记录指向 `<你的 GitHub 用户名>.github.io`。
3. 等待 DNS 生效后访问即可。
