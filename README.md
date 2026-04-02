# 医疗器械合规管理平台

基于 Node.js + Express + SQLite 构建的医疗器械合规管理平台，包含不良事件监控、内审管理和外审CAPA管理三大模块。

## 功能特性

### 不良事件监控
- **自动数据抓取**: 每日定时从 FDA openFDA API 抓取不良事件数据
- **竞品分类管理**: 支持内窥镜、心血管、骨科、神经外科等多类别竞品监控
- **智能摘要生成**: AI 自动生成竞品安全摘要，包含风险评估和关键发现
- **风险预警系统**: 自动识别高风险事件，实时推送预警
- **可视化仪表板**: 直观展示事件趋势、分类统计、竞品对比

### 内审管理系统
- **内审计划管理**: 创建、编辑、删除内审计划，支持级联删除关联数据
- **内审员管理**: 内审员信息的增删改查
- **不符合项管理**: 在内审计划详情页中录入、编辑、删除不符合项
- **一键导出**: 不符合项数据一键导出为 Excel 文件
- **可视化仪表板**: 内审概览统计展示

### 外审CAPA管理
- **外审项目管理**: 外部审核项目的创建和管理
- **CAPA跟踪**: 纠正与预防措施（CAPA）的录入、编辑、状态跟踪
- **多维度筛选**: 按审核日期、状态、严重程度、品牌等多条件筛选
- **AI智能分析**: 基于ISO 13485视角，AI自动分析CAPA数据，识别系统性问题
- **PPT报告生成**: 一键生成管理评审CAPA分析报告（PPTX格式），含执行摘要、关键指标、问题分析和改进建议

## 快速开始

### 1. 安装依赖

```bash
cd competitor-mdr-agent
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置 API 密钥等
```

需要配置的AI分析相关环境变量：
```
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=your_api_base_url
OPENAI_MODEL=your_model_name
```

### 3. 启动服务

```bash
npm start
```

访问 http://localhost:3000 查看仪表板

### 4. PM2部署（推荐）

```bash
pm2 start server.js --name mdr-system
pm2 save
pm2 startup
```

## 竞品配置

在 `config/competitors.js` 中配置需要监控的竞品：

```javascript
endoscopes: {
  name: '内窥镜类',
  competitors: [
    {
      id: 'spyglass',
      name: 'SpyGlass',
      manufacturer: 'Boston Scientific',
      keywords: ['spyglass', 'spyscope', 'spy ds'],
      deviceClass: 'Class II',
      productCode: 'KMQ'
    }
  ]
}
```

## API 接口

### 不良事件监控

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/dashboard` | GET | 获取仪表板数据 |
| `/api/competitors` | GET | 获取竞品列表 |
| `/api/competitors/:id/report` | GET | 获取竞品详细报告 |
| `/api/events` | GET | 获取不良事件列表 |
| `/api/statistics` | GET | 获取统计数据 |
| `/api/trigger-update` | POST | 手动触发数据更新 |
| `/api/fetch` | POST | 执行完整抓取任务 |

### 内审管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/audit-plans` | GET/POST | 获取/创建内审计划 |
| `/api/audit-plans/:id` | PUT/DELETE | 更新/删除内审计划 |
| `/api/auditors` | GET/POST | 获取/创建内审员 |
| `/api/auditors/:id` | PUT/DELETE | 更新/删除内审员 |
| `/api/nonconformities` | GET/POST | 获取/创建不符合项 |
| `/api/nonconformities/:id` | PUT/DELETE | 更新/删除不符合项 |

### 外审CAPA管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/external-audits` | GET/POST | 获取/创建外审项目 |
| `/api/external-audits/:id` | PUT/DELETE | 更新/删除外审项目 |
| `/api/external-capa` | GET/POST | 获取/创建CAPA |
| `/api/external-capa/all` | POST | 多条件筛选CAPA |
| `/api/external-capa/:id` | PUT/DELETE | 更新/删除CAPA |
| `/api/capa-analysis` | POST | AI分析CAPA数据 |
| `/api/capa-analysis/ppt` | POST | 生成CAPA分析PPT |

## 数据库

- `data/mdr_database.db` - 主数据库（不良事件、竞品数据）
- `data/audit_database.db` - 内审数据库（审核计划、内审员、不符合项）

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **前端**: Tailwind CSS + Chart.js
- **定时任务**: node-cron
- **日志**: Winston
- **PPT生成**: pptxgenjs
- **AI分析**: OpenAI兼容API

## 许可证

MIT
