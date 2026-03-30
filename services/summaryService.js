/**
 * 摘要生成服务
 * 使用 AI 生成不良事件数据摘要
 */
const logger = require('../utils/logger');

class SummaryService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  /**
   * 生成竞品摘要
   */
  async generateCompetitorSummary(events, competitor) {
    if (!events || events.length === 0) {
      return {
        summary: `${competitor.name} 在查询期间无不良事件报告`,
        riskLevel: 'low',
        keyFindings: [],
        recommendations: []
      };
    }

    // 基础统计
    const stats = this.calculateStats(events);
    
    // 问题分类
    const problems = this.categorizeProblems(events);
    
    // 生成文本摘要
    const summaryText = await this.generateAISummary(events, competitor, stats, problems);
    
    // 评估风险等级
    const riskLevel = this.assessRiskLevel(stats, problems);

    return {
      summary: summaryText,
      riskLevel,
      stats,
      problems,
      keyFindings: this.extractKeyFindings(events, stats),
      recommendations: this.generateRecommendations(stats, problems, riskLevel)
    };
  }

  /**
   * 计算统计数据
   */
  calculateStats(events) {
    const total = events.length;
    const injuries = events.filter(e => e.event_type === 'Injury').length;
    const malfunctions = events.filter(e => e.event_type === 'Malfunction').length;
    const deaths = events.filter(e => e.event_type === 'Death').length;
    
    // 按月份统计
    const monthlyData = {};
    events.forEach(e => {
      const month = e.receive_date?.substring(0, 7) || 'Unknown';
      monthlyData[month] = (monthlyData[month] || 0) + 1;
    });

    // 最常出现的问题
    const problemCounts = {};
    events.forEach(e => {
      if (e.product_problems) {
        e.product_problems.split(';').forEach(p => {
          const problem = p.trim();
          if (problem) {
            problemCounts[problem] = (problemCounts[problem] || 0) + 1;
          }
        });
      }
    });

    const topProblems = Object.entries(problemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count, percentage: ((count / total) * 100).toFixed(1) }));

    return {
      total,
      injuries,
      malfunctions,
      deaths,
      injuryRate: ((injuries / total) * 100).toFixed(1),
      malfunctionRate: ((malfunctions / total) * 100).toFixed(1),
      monthlyData,
      topProblems
    };
  }

  /**
   * 问题分类
   */
  categorizeProblems(events) {
    const categories = {
      mechanical: { name: '机械故障', count: 0, events: [] },
      electrical: { name: '电气故障', count: 0, events: [] },
      software: { name: '软件问题', count: 0, events: [] },
      material: { name: '材料问题', count: 0, events: [] },
      design: { name: '设计缺陷', count: 0, events: [] },
      other: { name: '其他', count: 0, events: [] }
    };

    const keywords = {
      mechanical: ['break', 'fracture', 'detach', 'separation', 'mechanical', 'stuck', 'jam'],
      electrical: ['power', 'electrical', 'battery', 'circuit', 'short'],
      software: ['software', 'firmware', 'program', 'algorithm', 'display'],
      material: ['material', 'biocompatibility', 'corrosion', 'degradation'],
      design: ['design', 'labeling', 'instruction', 'sizing']
    };

    events.forEach(event => {
      const problemText = (event.product_problems + ' ' + event.event_description).toLowerCase();
      let categorized = false;

      for (const [cat, words] of Object.entries(keywords)) {
        if (words.some(w => problemText.includes(w))) {
          categories[cat].count++;
          categories[cat].events.push(event);
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        categories.other.count++;
        categories.other.events.push(event);
      }
    });

    return categories;
  }

  /**
   * 使用 AI 生成摘要
   */
  async generateAISummary(events, competitor, stats, problems) {
    // 如果没有 OpenAI API Key，使用模板生成
    if (!this.openaiApiKey) {
      return this.generateTemplateSummary(competitor, stats, problems);
    }

    try {
      const prompt = this.buildPrompt(events, competitor, stats, problems);
      
      // 这里可以调用 OpenAI API
      // 暂时使用模板
      return this.generateTemplateSummary(competitor, stats, problems);
    } catch (error) {
      logger.error('AI Summary generation failed:', error.message);
      return this.generateTemplateSummary(competitor, stats, problems);
    }
  }

  /**
   * 构建 AI Prompt
   */
  buildPrompt(events, competitor, stats, problems) {
    return `
请根据以下医疗器械不良事件数据生成专业摘要：

竞品信息：
- 名称：${competitor.name}
- 制造商：${competitor.manufacturer}
- 类别：${competitor.category}

统计数据：
- 总事件数：${stats.total}
- 伤害事件：${stats.injuries} (${stats.injuryRate}%)
- 故障事件：${stats.malfunctions} (${stats.malfunctionRate}%)
- 死亡事件：${stats.deaths}

主要问题：
${stats.topProblems.map(p => `- ${p.name}: ${p.count}次 (${p.percentage}%)`).join('\n')}

请生成一份简洁的专业摘要，包括：
1. 整体风险评估
2. 主要安全问题
3. 趋势分析
4. 建议措施

摘要要求：
- 中文输出
- 专业、客观
- 200-300字
`;
  }

  /**
   * 模板生成摘要
   */
  generateTemplateSummary(competitor, stats, problems) {
    const parts = [];
    
    // 概述
    parts.push(`${competitor.name}（${competitor.manufacturer}）在查询期间共有${stats.total}起不良事件报告。`);
    
    // 风险分布
    if (stats.injuries > 0) {
      parts.push(`其中伤害事件${stats.injuries}起（占比${stats.injuryRate}%），`);
    }
    if (stats.deaths > 0) {
      parts.push(`死亡事件${stats.deaths}起，需重点关注。`);
    } else {
      parts.push(`无死亡事件报告。`);
    }
    
    // 主要问题
    if (stats.topProblems.length > 0) {
      const topProblem = stats.topProblems[0];
      parts.push(`最常见问题为"${topProblem.name}"（${topProblem.count}起）。`);
    }
    
    // 分类问题
    const problemCats = Object.entries(problems)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    
    if (problemCats.length > 0) {
      parts.push(`主要故障类型：${problemCats.map(([_, data]) => data.name).join('、')}。`);
    }
    
    return parts.join('');
  }

  /**
   * 评估风险等级
   */
  assessRiskLevel(stats, problems) {
    let score = 0;
    
    // 死亡事件权重最高
    if (stats.deaths > 0) score += 50;
    
    // 伤害事件比例
    if (parseFloat(stats.injuryRate) > 20) score += 20;
    else if (parseFloat(stats.injuryRate) > 10) score += 10;
    
    // 事件总数
    if (stats.total > 50) score += 15;
    else if (stats.total > 20) score += 10;
    
    // 设计缺陷问题
    if (problems.design.count > 0) score += 10;
    
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * 提取关键发现
   */
  extractKeyFindings(events, stats) {
    const findings = [];
    
    if (stats.deaths > 0) {
      findings.push({
        type: 'critical',
        title: '死亡事件',
        description: `报告期间发生${stats.deaths}起死亡事件，需立即评估产品安全性`
      });
    }
    
    if (parseFloat(stats.injuryRate) > 20) {
      findings.push({
        type: 'warning',
        title: '高伤害率',
        description: `伤害事件占比${stats.injuryRate}%，高于行业平均水平`
      });
    }
    
    if (stats.topProblems.length > 0 && stats.topProblems[0].count > stats.total * 0.3) {
      findings.push({
        type: 'info',
        title: '集中性问题',
        description: `"${stats.topProblems[0].name}"问题集中爆发，可能存在系统性缺陷`
      });
    }
    
    return findings;
  }

  /**
   * 生成建议
   */
  generateRecommendations(stats, problems, riskLevel) {
    const recommendations = [];
    
    if (riskLevel === 'high') {
      recommendations.push('建议立即启动产品安全评估，考虑暂停相关批次产品销售');
      recommendations.push('向监管部门报告严重不良事件，配合调查');
    } else if (riskLevel === 'medium') {
      recommendations.push('加强产品上市后监测，密切关注不良事件趋势');
      recommendations.push('评估现有风险控制措施的有效性');
    }
    
    if (problems.mechanical.count > stats.total * 0.3) {
      recommendations.push('针对机械故障问题，建议改进产品结构设计或加强质量控制');
    }
    
    if (stats.total > 30) {
      recommendations.push('事件数量较多，建议开展专项风险评估');
    }
    
    return recommendations;
  }

  /**
   * 生成分类摘要报告
   */
  async generateCategorySummary(category, events, competitors) {
    const categoryStats = {
      total: events.length,
      byCompetitor: {}
    };

    competitors.forEach(comp => {
      const compEvents = events.filter(e => e.competitor_id === comp.id);
      categoryStats.byCompetitor[comp.id] = {
        name: comp.name,
        count: compEvents.length,
        injuries: compEvents.filter(e => e.event_type === 'Injury').length
      };
    });

    return {
      category: category.name,
      description: category.description,
      stats: categoryStats,
      summary: `${category.name}类别共${events.length}起不良事件，涉及${competitors.length}个竞品。`
    };
  }
}

module.exports = new SummaryService();
