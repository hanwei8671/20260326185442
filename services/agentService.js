/**
 * Agent 核心服务
 * 协调数据抓取、分类、摘要生成
 */
const fdaService = require('./fdaService');
const translationService = require('./translationService');
const databaseService = require('./databaseService');
const summaryService = require('./summaryService');
const competitorService = require('./competitorService');
const logger = require('../utils/logger');
const moment = require('moment');

class AgentService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * 执行完整的数据抓取任务
   */
  async executeFetchTask(options = {}) {
    if (this.isRunning) {
      return { success: false, message: '任务正在执行中' };
    }

    this.isRunning = true;
    const results = {
      success: true,
      startTime: new Date(),
      competitorsProcessed: [],
      totalEvents: 0,
      errors: []
    };

    try {
      const { days = 30, competitorIds = null, startDate: customStartDate, endDate: customEndDate } = options;
      
      // 支持自定义时间段或按天数
      let startDate, endDate;
      if (customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        endDate = moment().format('YYYY-MM-DD');
        startDate = moment().subtract(days, 'days').format('YYYY-MM-DD');
      }

      // 获取需要处理的竞品列表
      let competitors = competitorService.getAllCompetitors();
      if (competitorIds && competitorIds.length > 0) {
        competitors = competitors.filter(c => competitorIds.includes(c.id));
      }

      logger.info(`开始抓取 ${competitors.length} 个竞品的数据，时间范围: ${startDate} 至 ${endDate}`);

      // 逐个处理竞品
      for (const competitor of competitors) {
        try {
          const competitorResult = await this.fetchCompetitorData(competitor, { startDate, endDate });
          results.competitorsProcessed.push(competitorResult);
          results.totalEvents += competitorResult.eventsCount;
        } catch (error) {
          logger.error(`处理竞品 ${competitor.name} 失败:`, error.message);
          results.errors.push({ competitor: competitor.name, error: error.message });
        }
      }

      // 生成分类摘要
      await this.generateCategorySummaries(startDate, endDate);

      results.endTime = new Date();
      results.duration = results.endTime - results.startTime;
      results.period = { startDate, endDate };

      logger.info(`任务完成，共处理 ${results.totalEvents} 条记录`);

    } catch (error) {
      logger.error('执行任务失败:', error.message);
      results.success = false;
      results.error = error.message;
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  /**
   * 抓取单个竞品数据
   */
  async fetchCompetitorData(competitor, dateRange) {
    logger.info(`开始抓取 ${competitor.name} 的数据`);

    // 从 FDA API 获取数据
    const fetchResult = await fdaService.fetchAllAdverseEvents(
      competitor.keywords,
      dateRange
    );

    if (!fetchResult.success) {
      throw new Error(`FDA API 请求失败: ${fetchResult.error}`);
    }

    // 解析数据
    const parsedEvents = fdaService.parseEventData(fetchResult.data);

    // 添加竞品分类信息
    const enrichedEvents = parsedEvents.map(event => ({
      ...event,
      competitorId: competitor.id,
      category: competitor.category
    }));

    // 翻译英文文本为中文（跳过已有翻译的记录，节省API调用）
    if (enrichedEvents.length > 0) {
      // 先查询数据库中已有的翻译
      const reportNumbers = enrichedEvents.map(e => e.reportNumber).filter(Boolean);
      const existingTranslations = await databaseService.getExistingTranslations(reportNumbers);
      const existingCount = Object.keys(existingTranslations).length;
      const needTranslate = enrichedEvents.filter(e => !existingTranslations[e.reportNumber]);
      logger.info(`翻译检查: ${enrichedEvents.length} 条数据, ${existingCount} 条已有翻译跳过, ${needTranslate.length} 条需要翻译`);

      // 直接复用已有翻译
      enrichedEvents.forEach(event => {
        const cached = existingTranslations[event.reportNumber];
        if (cached) {
          event.productProblemsCn = cached.productProblemsCn;
          event.patientProblemsCn = cached.patientProblemsCn;
          event.eventDescriptionCn = cached.eventDescriptionCn;
        }
      });

      // 只翻译缺少的
      if (needTranslate.length > 0) {
        logger.info(`开始翻译 ${needTranslate.length} 条事件的文本字段...`);
        for (const event of needTranslate) {
          try {
            const translated = await translationService.translateEvent(event);
            event.productProblemsCn = translated.productProblemsCn;
            event.patientProblemsCn = translated.patientProblemsCn;
            event.eventDescriptionCn = translated.eventDescriptionCn;
          } catch (err) {
            logger.warn(`翻译事件 ${event.reportNumber} 失败: ${err.message}`);
          }
        }
        logger.info(`翻译完成`);
      } else {
        logger.info(`所有数据均已有翻译，跳过翻译`);
      }
    }

    // 保存到数据库
    await databaseService.saveAdverseEventsBatch(enrichedEvents);

    // 生成竞品摘要
    const summary = await summaryService.generateCompetitorSummary(
      enrichedEvents,
      competitor
    );

    // 保存摘要报告
    await databaseService.saveSummaryReport({
      reportDate: moment().format('YYYY-MM-DD'),
      category: competitor.category,
      competitorId: competitor.id,
      totalEvents: enrichedEvents.length,
      injuryCount: summary.stats.injuries,
      malfunctionCount: summary.stats.malfunctions,
      deathCount: summary.stats.deaths,
      topProblems: summary.stats.topProblems,
      summaryText: summary.summary
    });

    // 记录抓取历史
    await databaseService.saveFetchHistory({
      competitorId: competitor.id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      recordsCount: enrichedEvents.length,
      status: 'success',
      message: summary.summary.substring(0, 200)
    });

    logger.info(`${competitor.name} 数据抓取完成: ${enrichedEvents.length} 条`);

    return {
      competitorId: competitor.id,
      competitorName: competitor.name,
      eventsCount: enrichedEvents.length,
      summary: summary.summary,
      riskLevel: summary.riskLevel
    };
  }

  /**
   * 生成分类摘要
   */
  async generateCategorySummaries(startDate, endDate) {
    const categories = competitorService.getCategories();
    
    for (const cat of categories) {
      const allEvents = await databaseService.getAdverseEvents({
        category: cat.name,
        startDate,
        endDate
      });

      const summary = await summaryService.generateCategorySummary(
        cat,
        allEvents,
        []
      );

      logger.info(`生成分类摘要: ${cat.name}`);
    }
  }

  /**
   * 获取竞品监控仪表板数据
   * 关键：与详情页 event-list 使用完全相同的日期过滤逻辑，
   *       保证首页显示的事件数与详情页一致
   */
  async getDashboardData(days = 30, customStartDate, customEndDate) {
    // 计算日期阈值
    let startDate, endDate;

    if (customStartDate && customEndDate) {
      // 自定义日期范围（YYYY-MM-DD → YYYYMMDD）
      startDate = customStartDate.replace(/-/g, '');
      endDate = customEndDate.replace(/-/g, '');
    } else if (days) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);
      startDate = thresholdDate.toISOString().split('T')[0].replace(/-/g, '');
    }

    const filters = { startDate };
    if (endDate) filters.endDate = endDate;

    // 获取所有竞品配置
    const competitors = competitorService.getAllCompetitors();

    // 按分类组织数据
    const byCategory = {};
    const allStats = [];

    for (const comp of competitors) {
      // 使用 getAdverseEvents（与详情页相同的数据源），确保数据一致
      const events = await databaseService.getAdverseEvents({
        competitorId: comp.id,
        ...filters
      });

      const total = events.length;
      const injuries = events.filter(e => e.event_type === 'Injury').length;
      const malfunctions = events.filter(e => e.event_type === 'Malfunction').length;
      const deaths = events.filter(e => e.event_type === 'Death').length;

      if (total === 0) continue; // 跳过无数据的竞品

      const category = comp.category || '未分类';

      if (!byCategory[category]) {
        byCategory[category] = {
          name: category,
          competitors: [],
          total: 0,
          injuries: 0,
          malfunctions: 0,
          deaths: 0
        };
      }

      byCategory[category].competitors.push({
        id: comp.id,
        name: comp.name || comp.id,
        total,
        injuries,
        malfunctions,
        deaths
      });

      byCategory[category].total += total;
      byCategory[category].injuries += injuries;
      byCategory[category].malfunctions += malfunctions;
      byCategory[category].deaths += deaths;

      allStats.push({ total, injuries, malfunctions, deaths });
    }

    // 获取最近事件（同样使用日期过滤）
    const recentEvents = await databaseService.getAdverseEvents({ ...filters, limit: 10 });

    // 获取风险预警
    const alerts = await this.generateAlertsFromStats(allStats);

    return {
      summary: {
        totalEvents: allStats.reduce((sum, s) => sum + s.total, 0),
        totalInjuries: allStats.reduce((sum, s) => sum + s.injuries, 0),
        totalMalfunctions: allStats.reduce((sum, s) => sum + s.malfunctions, 0),
        totalDeaths: allStats.reduce((sum, s) => sum + s.deaths, 0),
        categories: Object.keys(byCategory).length,
        competitors: allStats.length
      },
      byCategory: Object.values(byCategory),
      recentEvents,
      alerts
    };
  }

  /**
   * 生成风险预警
   */
  async generateAlertsFromStats(stats) {
    const alerts = [];

    stats.forEach(item => {
      if (item.deaths > 0) {
        alerts.push({
          level: 'critical',
          type: 'death_event',
          message: `报告 ${item.deaths} 起死亡事件`,
          timestamp: new Date()
        });
      }

      if (item.injuries > 0 && (item.injuries / item.total) > 0.3) {
        alerts.push({
          level: 'warning',
          type: 'high_injury_rate',
          message: `伤害事件占比超过30%`,
          timestamp: new Date()
        });
      }

      if (item.total > 20) {
        alerts.push({
          level: 'info',
          type: 'high_volume',
          message: `报告 ${item.total} 起不良事件，数量异常`,
          timestamp: new Date()
        });
      }
    });

    return alerts.sort((a, b) => {
      const levelOrder = { critical: 0, warning: 1, info: 2 };
      return levelOrder[a.level] - levelOrder[b.level];
    });
  }

  /**
   * 获取竞品详细报告
   */
  async getCompetitorReport(competitorId, options = {}) {
    const competitor = competitorService.getCompetitorById(competitorId);
    if (!competitor) {
      throw new Error('竞品不存在');
    }

    let startDate, endDate;
    if (options.startDate && options.endDate) {
      startDate = options.startDate;
      endDate = options.endDate;
    } else {
      const days = options.days || 30;
      endDate = moment().format('YYYY-MM-DD');
      startDate = moment().subtract(days, 'days').format('YYYY-MM-DD');
    }

    const events = await databaseService.getAdverseEvents({
      competitorId,
      startDate,
      endDate
    });

    const summary = await summaryService.generateCompetitorSummary(events, competitor);

    return {
      competitor,
      period: { startDate, endDate },
      events,
      summary
    };
  }

  /**
   * 手动触发数据更新
   */
  async triggerUpdate(options = {}) {
    const { competitorIds, startDate, endDate, days = 7 } = options;
    return this.executeFetchTask({ 
      days,
      competitorIds,
      startDate,
      endDate
    });
  }
}

module.exports = new AgentService();
