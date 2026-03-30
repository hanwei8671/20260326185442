/**
 * 竞品管理服务
 * 处理竞品的增删改查，支持系统预设和动态添加的竞品
 */
const fs = require('fs');
const path = require('path');
const competitorConfig = require('../config/competitors');
const logger = require('../utils/logger');

const DYNAMIC_CONFIG_PATH = path.join(__dirname, '..', 'config', 'dynamic-competitors.json');

class CompetitorService {
  constructor() {
    this.ensureConfigDir();
  }

  ensureConfigDir() {
    const dir = path.dirname(DYNAMIC_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载动态竞品配置
   */
  loadDynamicCompetitors() {
    try {
      if (fs.existsSync(DYNAMIC_CONFIG_PATH)) {
        const data = fs.readFileSync(DYNAMIC_CONFIG_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('加载动态竞品配置失败:', error.message);
    }
    return [];
  }

  /**
   * 保存动态竞品配置
   */
  saveDynamicCompetitors(competitors) {
    try {
      fs.writeFileSync(DYNAMIC_CONFIG_PATH, JSON.stringify(competitors, null, 2), 'utf8');
      return true;
    } catch (error) {
      logger.error('保存动态竞品配置失败:', error.message);
      return false;
    }
  }

  /**
   * 获取所有竞品（系统预设 + 动态添加）
   * 动态配置中 originalSource=system 的记录会覆盖对应的系统预设
   * isDisabled=true 的记录会被过滤掉
   */
  getAllCompetitors() {
    const systemCompetitors = competitorConfig.getDefaultCompetitors();
    const dynamicCompetitors = this.loadDynamicCompetitors();
    
    // 找出被禁用的系统预设 ID
    const disabledIds = new Set(
      dynamicCompetitors.filter(c => c.originalSource === 'system' && c.isDisabled).map(c => c.id)
    );
    
    // 找出被修改/覆盖的系统预设（非禁用的）
    const overrideMap = new Map(
      dynamicCompetitors.filter(c => c.originalSource === 'system' && !c.isDisabled).map(c => [c.id, c])
    );
    
    // 合并系统预设（跳过被禁用的，优先使用覆盖版本）和纯动态竞品
    const pureDynamic = dynamicCompetitors.filter(c => !c.originalSource);
    
    const merged = [
      ...systemCompetitors
        .filter(c => !disabledIds.has(c.id))
        .map(c => {
          const override = overrideMap.get(c.id);
          if (override) {
            return { ...c, ...override, source: 'dynamic' };
          }
          return { ...c, source: 'system' };
        }),
      ...pureDynamic.map(c => ({ ...c, source: 'dynamic' }))
    ];
    
    return merged;
  }

  /**
   * 根据ID获取竞品
   */
  getCompetitorById(id) {
    return this.getAllCompetitors().find(c => c.id === id);
  }

  /**
   * 添加竞品
   */
  addCompetitor(competitorData) {
    const competitors = this.loadDynamicCompetitors();
    
    // 检查ID是否已存在
    if (this.getCompetitorById(competitorData.id)) {
      throw new Error(`竞品ID '${competitorData.id}' 已存在`);
    }
    
    const newCompetitor = {
      ...competitorData,
      createdAt: new Date().toISOString()
    };
    
    competitors.push(newCompetitor);
    this.saveDynamicCompetitors(competitors);
    
    logger.info(`添加竞品: ${competitorData.name}`);
    return newCompetitor;
  }

  /**
   * 更新竞品
   */
  updateCompetitor(id, updates) {
    // 检查是否是动态竞品
    let dynamicCompetitors = this.loadDynamicCompetitors();
    const dynamicIndex = dynamicCompetitors.findIndex(c => c.id === id);
    
    if (dynamicIndex >= 0) {
      // 更新动态竞品
      dynamicCompetitors[dynamicIndex] = {
        ...dynamicCompetitors[dynamicIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveDynamicCompetitors(dynamicCompetitors);
      logger.info(`更新动态竞品: ${id}`);
      return dynamicCompetitors[dynamicIndex];
    }
    
    // 检查是否是系统预设竞品
    const systemCompetitor = competitorConfig.getDefaultCompetitorById(id);
    if (systemCompetitor) {
      // 系统预设竞品不能直接修改，需要创建覆盖记录
      // 将修改后的系统竞品保存到动态配置中作为覆盖
      const overrideCompetitor = {
        ...systemCompetitor,
        ...updates,
        id: id, // 保持原ID
        originalSource: 'system',
        updatedAt: new Date().toISOString()
      };
      
      // 检查是否已有覆盖记录
      const existingOverrideIndex = dynamicCompetitors.findIndex(c => c.id === id && c.originalSource === 'system');
      if (existingOverrideIndex >= 0) {
        dynamicCompetitors[existingOverrideIndex] = overrideCompetitor;
      } else {
        dynamicCompetitors.push(overrideCompetitor);
      }
      
      this.saveDynamicCompetitors(dynamicCompetitors);
      logger.info(`更新系统预设竞品(创建覆盖): ${id}`);
      return overrideCompetitor;
    }
    
    throw new Error(`竞品 '${id}' 不存在`);
  }

  /**
   * 删除竞品
   */
  deleteCompetitor(id) {
    // 尝试从动态配置中删除
    let dynamicCompetitors = this.loadDynamicCompetitors();
    const dynamicIndex = dynamicCompetitors.findIndex(c => c.id === id);
    
    if (dynamicIndex >= 0) {
      const deleted = dynamicCompetitors.splice(dynamicIndex, 1)[0];
      this.saveDynamicCompetitors(dynamicCompetitors);
      logger.info(`删除动态竞品: ${id}`);
      return deleted;
    }
    
    // 检查是否是系统预设竞品
    const systemCompetitor = competitorConfig.getDefaultCompetitorById(id);
    if (systemCompetitor) {
      // 系统预设竞品不能直接删除，创建禁用记录
      const disabledCompetitor = {
        ...systemCompetitor,
        id: id,
        originalSource: 'system',
        isDisabled: true,
        disabledAt: new Date().toISOString()
      };
      
      dynamicCompetitors.push(disabledCompetitor);
      this.saveDynamicCompetitors(dynamicCompetitors);
      logger.info(`禁用系统预设竞品: ${id}`);
      return disabledCompetitor;
    }
    
    throw new Error(`竞品 '${id}' 不存在`);
  }

  /**
   * 恢复系统预设竞品（取消修改/删除）
   */
  restoreSystemCompetitor(id) {
    let dynamicCompetitors = this.loadDynamicCompetitors();
    const index = dynamicCompetitors.findIndex(c => c.id === id && c.originalSource === 'system');
    
    if (index >= 0) {
      const restored = dynamicCompetitors.splice(index, 1)[0];
      this.saveDynamicCompetitors(dynamicCompetitors);
      logger.info(`恢复系统预设竞品: ${id}`);
      return restored;
    }
    
    throw new Error(`系统预设竞品 '${id}' 没有修改记录`);
  }

  /**
   * 重置所有系统预设竞品
   */
  resetAllSystemCompetitors() {
    let dynamicCompetitors = this.loadDynamicCompetitors();
    // 只保留纯动态添加的竞品（没有originalSource的）
    const pureDynamic = dynamicCompetitors.filter(c => !c.originalSource);
    this.saveDynamicCompetitors(pureDynamic);
    logger.info('重置所有系统预设竞品');
    return true;
  }

  /**
   * 根据关键词匹配竞品
   */
  findCompetitorByKeyword(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllCompetitors().filter(c => 
      c.keywords && c.keywords.some(k => lowerKeyword.includes(k.toLowerCase()))
    );
  }

  /**
   * 获取分类列表
   */
  getCategories() {
    return competitorConfig.getCategories();
  }
}

module.exports = new CompetitorService();
