# 医疗器械合规管理平台

基于 Node.js + Express + SQLite 构建的医疗器械合规管理平台，包含不良事件监控和内审管理系统两大模块。

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

### 3. 启动服务

```bash
npm start
```

访问 http://localhost:3000 查看仪表板

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

## 定时任务

默认每天凌晨 2:00 自动执行数据抓取，可在 `.env` 中配置：

```
CRON_SCHEDULE=0 2 * * *
```

## 数据结构

### 不良事件记录

- 报告编号、MDR报告编号
- 事件日期、报告日期
- 器械信息（品牌、型号、制造商）
- 产品问题描述
- 患者信息（年龄、性别、结果）
- 事件详细描述

### 摘要报告

- 竞品整体风险评估
- 事件类型分布统计
- 主要安全问题识别
- 趋势分析和建议措施

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite3
- **前端**: Tailwind CSS + Chart.js
- **定时任务**: node-cron
- **日志**: Winston

## 许可证

MIT
