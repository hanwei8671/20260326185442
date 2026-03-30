/**
 * AI 分析报告生成服务
 * 基于不良事件数据，利用 AI 生成专业的检索分析报告
 * 支持飞书 Aily 和 OpenAI 兼容接口
 */
const lark = require('@larksuiteoapi/node-sdk');
const OpenAI = require('openai');
const logger = require('../utils/logger');

class ReportService {
  constructor() {
    // 飞书 Aily 配置
    this.feishuAppId = process.env.FEISHU_APP_ID;
    this.feishuAppSecret = process.env.FEISHU_APP_SECRET;
    this.ailyAppId = process.env.AILY_APP_ID;

    // OpenAI 兼容接口配置（备用）
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseUrl = process.env.OPENAI_BASE_URL;
    this.model = process.env.OPENAI_MODEL || 'gpt-4';

    // 优先使用飞书 Aily
    if (this.feishuAppId && this.feishuAppSecret && this.ailyAppId) {
      this.larkClient = new lark.Client({
        appId: this.feishuAppId,
        appSecret: this.feishuAppSecret
      });
      this.aily = new lark.Aily({ client: this.larkClient });
      this.provider = 'aily';
      logger.info(`AI报告服务初始化: 飞书 Aily, ailyAppId=${this.ailyAppId}`);
    } else if (this.apiKey && this.baseUrl) {
      this.openaiClient = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl
      });
      this.provider = 'openai';
      logger.info(`AI报告服务初始化: OpenAI兼容接口, model=${this.model}, baseUrl=${this.baseUrl}`);
    } else {
      this.provider = null;
      logger.warn('AI报告服务: 未配置 AI 服务（需要飞书 Aily 或 OpenAI 兼容接口配置）');
    }
  }

  /**
   * 生成不良事件检索分析报告
   * @param {Object} params - { events, competitor, startDate, endDate }
   * @returns {string} Markdown 格式的分析报告
   */
  async generateAnalysisReport(params) {
    const { events, competitor, startDate, endDate } = params;

    if (!this.provider) {
      throw new Error('AI 服务未配置，请在 .env 中设置飞书 Aily 或 OpenAI 兼容接口配置');
    }

    if (!events || events.length === 0) {
      throw new Error('没有不良事件数据可分析');
    }

    // 准备统计数据
    const stats = this.calculateStats(events);
    const problemDistribution = this.analyzeProblemDistribution(events);
    const sampleEvents = this.selectSampleEvents(events, 10);

    // 构建提示词
    const prompt = this.buildReportPrompt(competitor, stats, problemDistribution, sampleEvents, startDate, endDate);

    logger.info(`开始生成AI分析报告: ${competitor.name}, ${events.length}条事件, provider=${this.provider}`);

    try {
      let report;

      if (this.provider === 'aily') {
        report = await this.callAily(prompt);
      } else {
        report = await this.callOpenAI(prompt);
      }

      if (!report) {
        throw new Error('AI 返回内容为空');
      }

      logger.info(`AI分析报告生成完成: ${report.length}字`);
      return report;

    } catch (error) {
      logger.error('AI报告生成失败:', error.message);
      throw new Error(`AI报告生成失败: ${error.message}`);
    }
  }

  /**
   * 调用飞书 Aily
   */
  async callAily(prompt) {
    logger.info(`Aily 调用: prompt长度=${prompt.length}字符`);
    logger.debug(`Aily 调用 prompt 前500字符: ${prompt.substring(0, 500)}`);
    
    const response = await this.aily.completions.create({
      message: prompt,
      ailyAppId: this.ailyAppId
    });
    
    logger.info(`Aily 响应: ${JSON.stringify(response).substring(0, 500)}`);
    return response.content || '';
  }

  /**
   * 调用 OpenAI 兼容接口
   */
  async callOpenAI(prompt) {
    const response = await this.openaiClient.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: `你是一位资深的医疗器械不良事件分析专家，擅长从FDA MAUDE数据库中的不良事件数据中发现安全风险趋势、分析故障模式、并提出专业的风险管理建议。你的报告应该专业、客观、数据驱动，适合提交给医疗器械注册和监管部门。请使用中文输出，使用Markdown格式。`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });
    return response.choices[0]?.message?.content || '';
  }

  /**
   * 计算统计数据
   */
  calculateStats(events) {
    const total = events.length;
    const injuries = events.filter(e => e.event_type === 'Injury').length;
    const malfunctions = events.filter(e => e.event_type === 'Malfunction').length;
    const deaths = events.filter(e => e.event_type === 'Death').length;

    // 按月统计趋势
    const monthlyTrend = {};
    events.forEach(e => {
      const month = (e.receive_date || '').substring(0, 6) || 'unknown';
      if (!monthlyTrend[month]) monthlyTrend[month] = { total: 0, injury: 0, malfunction: 0, death: 0 };
      monthlyTrend[month].total++;
      if (e.event_type === 'Injury') monthlyTrend[month].injury++;
      if (e.event_type === 'Malfunction') monthlyTrend[month].malfunction++;
      if (e.event_type === 'Death') monthlyTrend[month].death++;
    });

    // 患者性别分布
    const genderDist = { M: 0, F: 0, unknown: 0 };
    events.forEach(e => {
      if (e.patient_sex === 'M') genderDist.M++;
      else if (e.patient_sex === 'F') genderDist.F++;
      else genderDist.unknown++;
    });

    return {
      total,
      injuries,
      malfunctions,
      deaths,
      injuryRate: ((injuries / total) * 100).toFixed(1),
      malfunctionRate: ((malfunctions / total) * 100).toFixed(1),
      deathRate: ((deaths / total) * 100).toFixed(1),
      monthlyTrend: Object.entries(monthlyTrend).sort(([a], [b]) => a.localeCompare(b)),
      genderDist
    };
  }

  /**
   * 分析问题分布
   */
  analyzeProblemDistribution(events) {
    const problemMap = {};
    events.forEach(e => {
      const problem = e.product_problems || '未分类问题';
      problem.split(';').forEach(p => {
        const trimmed = p.trim();
        if (trimmed) {
          problemMap[trimmed] = (problemMap[trimmed] || 0) + 1;
        }
      });
    });

    return Object.entries(problemMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([problem, count]) => ({
        problem,
        count,
        percentage: ((count / events.length) * 100).toFixed(1)
      }));
  }

  /**
   * 选取代表性事件样本
   */
  selectSampleEvents(events, maxCount) {
    // 优先选取有中文翻译的事件
    const withCn = events.filter(e => e.event_description_cn || e.product_problems_cn);
    const selected = withCn.length >= 5 ? withCn : events;

    // 按严重程度优先选取
    const priority = { Death: 0, Injury: 1, Malfunction: 2 };
    selected.sort((a, b) => (priority[a.event_type] ?? 3) - (priority[b.event_type] ?? 3));

    return selected.slice(0, maxCount).map(e => ({
      reportNumber: e.report_number,
      receiveDate: e.receive_date,
      eventType: e.event_type,
      deviceBrandName: e.device_brand_name,
      manufacturer: e.device_manufacturer,
      productProblems: e.product_problems_cn || e.product_problems,
      patientProblems: e.patient_problems_cn || e.patient_problems,
      eventDescription: e.event_description_cn || e.event_description,
      patientAge: e.patient_age,
      patientSex: e.patient_sex
    }));
  }

  /**
   * 构建报告提示词
   */
  buildReportPrompt(competitor, stats, problemDistribution, sampleEvents, startDate, endDate) {
    const period = startDate && endDate ? `${startDate} 至 ${endDate}` : '全部时间段';

    return `请根据以下不良事件数据，为竞品"${competitor.name}"（制造商：${competitor.manufacturer || '未知'}，分类：${competitor.category || '未知'}）生成一份专业的医疗器械不良事件检索分析报告。

## 检索范围
- 竞品: ${competitor.name}
- 制造商: ${competitor.manufacturer || '未知'}
- 数据来源: FDA MAUDE 数据库
- 检索时间: ${period}

## 数据统计概览
- 不良事件总数: ${stats.total} 起
- 伤害事件: ${stats.injuries} 起（占比 ${stats.injuryRate}%）
- 故障事件: ${stats.malfunctions} 起（占比 ${stats.malfunctionRate}%）
- 死亡事件: ${stats.deaths} 起（占比 ${stats.deathRate}%）
- 患者性别分布: 男性 ${stats.genderDist.M} 例，女性 ${stats.genderDist.F} 例，未知 ${stats.genderDist.unknown} 例

## 月度趋势
${stats.monthlyTrend.map(([month, data]) => `- ${month}: 共 ${data.total} 起（伤害 ${data.injury}，故障 ${data.malfunction}，死亡 ${data.death}）`).join('\n')}

## 主要问题分布（Top 15）
${problemDistribution.map(p => `- "${p.problem}": ${p.count} 起（${p.percentage}%）`).join('\n')}

## 典型事件样本（${sampleEvents.length} 例）
${sampleEvents.map((e, i) => `### 案例 ${i + 1}（报告号: ${e.reportNumber}）
- 接收日期: ${e.receiveDate}
- 事件类型: ${e.eventType}
- 产品名称: ${e.deviceBrandName}
- 制造商: ${e.manufacturer}
- 产品问题: ${e.productProblems}
- 患者问题: ${e.patientProblems}
- 事件描述: ${e.eventDescription ? e.eventDescription.substring(0, 300) : '无'}
- 患者信息: ${e.patientAge ? e.patientAge + '岁' : '未知'}, ${e.patientSex === 'M' ? '男' : e.patientSex === 'F' ? '女' : '未知'}`).join('\n\n')}

---

## 报告要求

请生成一份结构完整、专业的不良事件检索分析报告，包含以下章节：

1. **报告概述** - 简要说明检索目的、范围和方法
2. **数据统计摘要** - 用表格或列表形式呈现核心数据
3. **趋势分析** - 分析不良事件的时间趋势、类型分布
4. **主要问题分析** - 针对排名前5的问题类型进行深入分析
5. **典型案例分析** - 从样本中选取2-3个代表性案例进行详细分析
6. **风险评价** - 综合评估该竞品的安全风险等级（高/中/低），并说明理由
7. **对比建议** - 与我公司同类产品进行风险对比的参考建议
8. **结论与建议** - 总结主要发现，提出具体的行动建议

注意：
- 使用中文输出
- 使用 Markdown 格式
- 数据引用要准确
- 分析要客观专业
- 风险评价要基于数据支撑
- 建议要具体可执行`;
  }
}

module.exports = new ReportService();
