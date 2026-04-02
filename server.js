/**
 * 竞品医疗器械不良事件监控 Agent - 服务端
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const XLSX = require('xlsx');
require('dotenv').config();

const agentService = require('./services/agentService');
const databaseService = require('./services/databaseService');
const competitorService = require('./services/competitorService');
const reportService = require('./services/reportService');
const logger = require('./utils/logger');

// 内审管理系统路由
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 注册内审管理系统 API 路由
app.use('/audit', auditRoutes);

// ======== API 路由 ========

/**
 * 获取仪表板数据
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let days;

    if (startDate && endDate) {
      // 自定义日期范围模式
      days = null;
    } else {
      days = req.query.days;
      if (days === 'all') {
        days = 9999;
      } else {
        days = parseInt(days) || 30;
      }
    }
    const data = await agentService.getDashboardData(days, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Dashboard API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个竞品的事件数（用于首页展示，与详情页数据一致）
 */
app.get('/api/competitors/:id/event-count', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, days } = req.query;

    const filters = { competitorId: id };
    
    if (startDate && endDate) {
      filters.startDate = startDate;
      filters.endDate = endDate;
    } else if (days) {
      const d = days === 'all' ? 9999 : parseInt(days);
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - d);
      filters.startDate = threshold.toISOString().split('T')[0].replace(/-/g, '');
    }

    const events = await databaseService.getAdverseEvents({ ...filters, limit: 100000 });
    const injuryCount = events.filter(e => e.event_type === 'Injury').length;
    const malfunctionCount = events.filter(e => e.event_type === 'Malfunction').length;
    const deathCount = events.filter(e => e.event_type === 'Death').length;

    res.json({
      success: true,
      data: {
        total: events.length,
        injuries: injuryCount,
        malfunctions: malfunctionCount,
        deaths: deathCount
      }
    });
  } catch (error) {
    logger.error('Event count API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取分类列表
 */
app.get('/api/categories', (req, res) => {
  try {
    const categories = competitorService.getCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======== 竞品管理 API ========

/**
 * 获取所有竞品
 */
app.get('/api/competitors', (req, res) => {
  try {
    const competitors = competitorService.getAllCompetitors();
    res.json({ success: true, data: competitors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个竞品详情
 */
app.get('/api/competitors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const competitor = competitorService.getCompetitorById(id);
    if (!competitor) {
      return res.status(404).json({ success: false, error: '竞品不存在' });
    }
    res.json({ success: true, data: competitor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加竞品
 */
app.post('/api/competitors', (req, res) => {
  try {
    const competitorData = req.body;
    
    // 验证必填字段
    if (!competitorData.id || !competitorData.name || !competitorData.category) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少必填字段: id, name, category' 
      });
    }
    
    const competitor = competitorService.addCompetitor(competitorData);
    res.json({ success: true, data: competitor });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 更新竞品
 */
app.put('/api/competitors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const competitor = competitorService.updateCompetitor(id, updates);
    res.json({ success: true, data: competitor });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 删除竞品
 */
app.delete('/api/competitors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const competitor = competitorService.deleteCompetitor(id);
    res.json({ success: true, data: competitor });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 恢复系统预设竞品
 */
app.post('/api/competitors/:id/restore', (req, res) => {
  try {
    const { id } = req.params;
    const competitor = competitorService.restoreSystemCompetitor(id);
    res.json({ success: true, data: competitor });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * 重置所有系统预设竞品
 */
app.post('/api/competitors/reset-all', (req, res) => {
  try {
    competitorService.resetAllSystemCompetitors();
    res.json({ success: true, message: '已重置所有系统预设竞品' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======== 不良事件 API ========

/**
 * 获取竞品详细报告（支持自定义时间段）
 */
app.get('/api/competitors/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, days } = req.query;
    
    const options = {};
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    } else {
      options.days = parseInt(days) || 30;
    }
    
    const report = await agentService.getCompetitorReport(id, options);
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Competitor report API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取不良事件列表（支持时间段筛选）
 */
app.get('/api/events', async (req, res) => {
  try {
    const filters = {
      competitorId: req.query.competitorId,
      category: req.query.category,
      eventType: req.query.eventType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      keyword: req.query.keyword,
      limit: parseInt(req.query.limit) || 50
    };
    
    const events = await databaseService.getAdverseEvents(filters);
    res.json({ success: true, data: events, count: events.length });
  } catch (error) {
    logger.error('Events API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个事件详情
 */
app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await databaseService.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, error: '事件不存在' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    logger.error('Event detail API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取统计数据（支持时间段筛选）
 */
app.get('/api/statistics', async (req, res) => {
  try {
    const { startDate, endDate, days } = req.query;
    
    let stats;
    if (startDate && endDate) {
      stats = await databaseService.getStatisticsByDateRange(startDate, endDate);
    } else {
      stats = await databaseService.getStatistics(parseInt(days) || 30);
    }
    
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Statistics API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ======== 数据抓取 API ========

/**
 * 回填已有数据的翻译
 */
app.post('/api/backfill-translations', async (req, res) => {
  try {
    const translationService = require('./services/translationService');
    const databaseService = require('./services/databaseService');

    let totalUpdated = 0;
    let batchNum = 0;
    const BATCH_SIZE = 50;

    // 循环处理直到没有未翻译数据
    while (true) {
      batchNum++;
      const untranslated = await databaseService.getUntranslatedEvents(BATCH_SIZE);
      if (untranslated.length === 0) break;

      logger.info(`回填第 ${batchNum} 批，共 ${untranslated.length} 条记录`);

      // 批量翻译
      const translationMap = await translationService.translateEventBatch(untranslated);

      // 逐条更新
      let updated = 0;
      for (const row of untranslated) {
        const translation = translationMap.get(row.id);
        if (translation && (translation.productProblemsCn || translation.patientProblemsCn || translation.eventDescriptionCn)) {
          await databaseService.updateEventTranslation(row.id, translation);
          updated++;
        }
      }

      totalUpdated += updated;
      logger.info(`第 ${batchNum} 批完成，更新 ${updated} 条，累计 ${totalUpdated} 条`);
    }

    logger.info(`翻译回填全部完成，共更新 ${totalUpdated} 条`);
    res.json({ success: true, message: `翻译回填完成，共 ${totalUpdated} 条`, processed: totalUpdated });
  } catch (error) {
    logger.error('翻译回填失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 手动触发数据更新（支持自定义时间段）
 */
app.post('/api/trigger-update', async (req, res) => {
  try {
    const { competitorIds, startDate, endDate, days } = req.body;
    
    const options = { competitorIds };
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    } else {
      options.days = days || 7;
    }
    
    const result = await agentService.triggerUpdate(options);
    res.json(result);
  } catch (error) {
    logger.error('Trigger update API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 执行完整抓取任务（支持自定义时间段）
 */
app.post('/api/fetch', async (req, res) => {
  try {
    const { competitorIds, startDate, endDate, days } = req.body;
    
    const options = { competitorIds };
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    } else {
      options.days = days || 30;
    }
    
    const result = await agentService.executeFetchTask(options);
    res.json(result);
  } catch (error) {
    logger.error('Fetch API error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取系统状态
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'running',
      version: '1.0.0',
      timestamp: new Date(),
      agentRunning: agentService.isRunning
    }
  });
});

/**
 * 导出竞品不良事件Excel（双Sheet：详细列表 + 分类汇总）
 */
app.post('/api/export-competitor-excel', async (req, res) => {
  try {
    const { competitorId, startDate, endDate } = req.body;
    
    // 直接从数据库查询
    const filters = { competitorId };
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    filters.limit = 5000;
    
    const events = await databaseService.getAdverseEvents(filters);
    
    if (!events || events.length === 0) {
      return res.status(400).json({ success: false, error: '没有数据导出' });
    }

    // 获取竞品信息
    const competitor = competitorService.getCompetitorById(competitorId);
    const competitorName = competitor ? competitor.name : '未知竞品';

    // ===== Sheet 1: 详细事件列表 =====
    const detailData = events.map((e, index) => ({
      '序号': index + 1,
      '报告号': e.report_number || '',
      '接收日期': e.receive_date || '',
      '事件日期': e.event_date || '',
      '产品名称': e.device_brand_name || '',
      '通用名称': e.device_generic_name || '',
      '制造商': e.device_manufacturer || '',
      '型号': e.device_model_number || '',
      '目录号': e.device_catalog_number || '',
      '序列号': e.device_serial_number || '',
      '产品代码': e.product_code || '',
      '事件类型': e.event_type === 'Injury' ? '伤害' : (e.event_type === 'Malfunction' ? '故障' : (e.event_type === 'Death' ? '死亡' : e.event_type)),
      '产品问题': e.product_problems || '',
      '患者年龄': e.patient_age || '',
      '患者性别': e.patient_sex === 'M' ? '男性' : (e.patient_sex === 'F' ? '女性' : e.patient_sex || ''),
      '患者问题': e.patient_problems || '',
      '事件描述': e.event_description || ''
    }));

    // ===== Sheet 2: 分类汇总 =====
    // 按产品问题分类汇总
    const problemCounts = {};
    events.forEach(e => {
      const problem = e.product_problems || '未知问题';
      if (!problemCounts[problem]) {
        problemCounts[problem] = { count: 0, injury: 0, malfunction: 0, death: 0, events: [] };
      }
      problemCounts[problem].count++;
      if (e.event_type === 'Injury') problemCounts[problem].injury++;
      if (e.event_type === 'Malfunction') problemCounts[problem].malfunction++;
      if (e.event_type === 'Death') problemCounts[problem].death++;
      problemCounts[problem].events.push(e);
    });

    // 生成预防对策
    const summaryData = Object.entries(problemCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([problem, data]) => ({
        '问题类型': problem,
        '事件总数': data.count,
        '伤害': data.injury,
        '故障': data.malfunction,
        '死亡': data.death,
        '占比(%)': ((data.count / events.length) * 100).toFixed(1),
        '预防对策建议': generatePreventionSuggestion(problem, data)
      }));

    // 创建工作簿
    const wb = XLSX.utils.book_new();
    
    // 添加Sheet 1
    const ws1 = XLSX.utils.json_to_sheet(detailData);
    // 设置列宽
    ws1['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
      { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 10 }, { wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 8 },
      { wch: 30 }, { wch: 50 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, '详细事件列表');

    // 添加Sheet 2
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    ws2['!cols'] = [
      { wch: 40 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 60 }
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '分类汇总与预防对策');

    // 导出
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    
    // 使用ASCII兼容的文件名（避免编码问题）
    const safeFileName = `MDR_Report_${competitorId}_${Date.now()}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(buffer);
    
  } catch (error) {
    logger.error('Export Excel error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AI 生成不良事件检索分析报告
 */
app.post('/api/generate-ai-report', async (req, res) => {
  try {
    const { competitorId, startDate, endDate } = req.body;

    if (!competitorId) {
      return res.status(400).json({ success: false, error: '缺少竞品ID' });
    }

    // 查询数据
    const filters = { competitorId };
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    filters.limit = 500;

    const events = await databaseService.getAdverseEvents(filters);

    if (!events || events.length === 0) {
      return res.status(400).json({ success: false, error: '没有不良事件数据可供分析' });
    }

    // 获取竞品信息
    const competitor = competitorService.getCompetitorById(competitorId);

    // 生成报告
    const report = await reportService.generateAnalysisReport({
      events,
      competitor: competitor || { name: competitorId, category: '未知' },
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: {
        report,
        generatedAt: new Date().toISOString(),
        competitorId,
        eventCount: events.length,
        period: { startDate, endDate }
      }
    });

  } catch (error) {
    logger.error('AI Report generation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 生成预防对策建议
function generatePreventionSuggestion(problem, data) {
  const problemLower = problem.toLowerCase();
  
  let suggestions = [];
  
  // 根据问题类型生成建议
  if (problemLower.includes('break') || problemLower.includes('fracture') || problemLower.includes('断裂')) {
    suggestions.push('1. 检查产品材质和制造工艺，加强质量控制');
    suggestions.push('2. 评估产品使用寿命，必要时缩短更换周期');
  }
  if (problemLower.includes('error') || problemLower.includes(' malfunction') || problemLower.includes('故障')) {
    suggestions.push('1. 加强设备维护和定期校准');
    suggestions.push('2. 优化软件算法，提升设备稳定性');
    suggestions.push('3. 改进用户操作界面，减少误操作');
  }
  if (problemLower.includes('injur') || problemLower.includes('damage') || problemLower.includes('伤害')) {
    suggestions.push('1. 完善产品使用说明和警示标识');
    suggestions.push('2. 加强操作人员培训');
    suggestions.push('3. 评估产品设计安全性，必要时进行改进');
  }
  if (problemLower.includes('death') || problemLower.includes('死亡')) {
    suggestions.push('1. 立即启动产品安全调查');
    suggestions.push('2. 评估是否需要发布安全通告或召回');
    suggestions.push('3. 与监管机构保持沟通');
  }
  if (problemLower.includes('battery') || problemLower.includes('电源') || problemLower.includes('充电')) {
    suggestions.push('1. 检查电池管理系统安全性');
    suggestions.push('2. 评估电池容量和循环寿命');
    suggestions.push('3. 添加电量不足预警功能');
  }
  if (problemLower.includes('connect') || problemLower.includes('连接')) {
    suggestions.push('1. 检查接口设计牢固性');
    suggestions.push('2. 增强连接线缆的耐用性');
  }
  if (problemLower.includes('software') || problemLower.includes('程序') || problemLower.includes('固件')) {
    suggestions.push('1. 加强软件测试和验证');
    suggestions.push('2. 建立补丁更新机制');
    suggestions.push('3. 完善异常处理逻辑');
  }
  if (problemLower.includes('allerg') || problemLower.includes('过敏') || problemLower.includes('皮肤')) {
    suggestions.push('1. 评估材料生物相容性');
    suggestions.push('2. 增加产品使用前的过敏测试提醒');
  }
  
  // 通用建议
  if (suggestions.length === 0) {
    suggestions.push('1. 收集更多事件数据进行深入分析');
    suggestions.push('2. 关注类似产品的行业召回信息');
    suggestions.push('3. 建立产品不良事件跟踪机制');
  }
  
  return suggestions.join('\n');
}

// ======== 前端页面 ========

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/competitors', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'competitors.html'));
});

app.get('/events', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'events.html'));
});

app.get('/event-list', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'event-list.html'));
});

app.get('/event-detail', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'event-detail.html'));
});

// ======== 定时任务 ========

// 每天凌晨 2 点自动执行数据抓取
const cronSchedule = process.env.CRON_SCHEDULE || '0 2 * * *';
cron.schedule(cronSchedule, async () => {
  logger.info('执行定时数据抓取任务');
  try {
    await agentService.executeFetchTask({ days: 1 }); // 每天抓取前一天的数据
  } catch (error) {
    logger.error('定时任务执行失败:', error.message);
  }
});

// ======== 启动服务 ========

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`=================================`);
  logger.info(`竞品医疗器械不良事件监控 Agent`);
  logger.info(`服务启动成功: http://localhost:${PORT}`);
  logger.info(`=================================`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  databaseService.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  databaseService.close();
  process.exit(0);
});
