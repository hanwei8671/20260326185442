/**
 * FDA openFDA API 服务
 * 用于抓取医疗器械不良事件数据
 */
const axios = require('axios');
const logger = require('../utils/logger');

class FDAService {
  constructor() {
    this.baseURL = process.env.FDA_API_BASE_URL || 'https://api.fda.gov';
    this.apiKey = process.env.FDA_API_KEY || '';
    this.rateLimitDelay = 1000; // API 调用间隔 1 秒
  }

  /**
   * 构建搜索查询
   */
  buildQuery(keywords, dateRange = {}) {
    const { startDate, endDate } = dateRange;
    
    // 构建关键词查询
    const keywordQueries = keywords.map(kw => 
      `(device.brand_name:"${kw}"+device.generic_name:"${kw}")`
    ).join('+OR+');
    
    let query = keywordQueries;
    
    // 添加日期范围
    if (startDate && endDate) {
      query += `+AND+date_received:[${startDate.replace(/-/g, '')}+TO+${endDate.replace(/-/g, '')}]`;
    }
    
    return query;
  }

  /**
   * 抓取不良事件数据
   */
  async fetchAdverseEvents(keywords, options = {}) {
    const { 
      startDate, 
      endDate, 
      limit = 100,
      skip = 0 
    } = options;

    const query = this.buildQuery(keywords, { startDate, endDate });
    const url = `${this.baseURL}/device/event.json?search=${query}&limit=${limit}&skip=${skip}`;
    
    try {
      logger.info(`Fetching FDA data: ${url}`);
      
      const response = await axios.get(url, {
        headers: this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {},
        timeout: 30000
      });

      const { results, meta } = response.data;
      
      return {
        success: true,
        data: results || [],
        total: meta?.results?.total || 0,
        skip: meta?.results?.skip || 0,
        limit: meta?.results?.limit || limit
      };
    } catch (error) {
      logger.error('FDA API Error:', error.message);
      
      if (error.response?.status === 404) {
        return { success: true, data: [], total: 0, skip: 0, limit };
      }
      
      throw new Error(`FDA API 请求失败: ${error.message}`);
    }
  }

  /**
   * 抓取所有分页数据
   */
  async fetchAllAdverseEvents(keywords, options = {}) {
    const allData = [];
    let skip = 0;
    const limit = 100;
    let total = 0;

    do {
      const result = await this.fetchAdverseEvents(keywords, {
        ...options,
        limit,
        skip
      });

      if (!result.success) {
        throw new Error('获取数据失败');
      }

      allData.push(...result.data);
      total = result.total;
      skip += limit;

      // 延迟避免触发限流
      if (skip < total) {
        await this.delay(this.rateLimitDelay);
      }

    } while (skip < total && skip < 5000); // 最多获取 5000 条

    return {
      success: true,
      data: allData,
      total: allData.length
    };
  }

  /**
   * 解析原始数据为结构化格式
   */
  parseEventData(rawData) {
    return rawData.map(event => {
      const device = event.device?.[0] || {};
      const patient = event.patient?.[0] || {};
      const mdrText = event.mdr_text?.[0] || {};

      return {
        reportNumber: event.report_number || '',
        mdrReportKey: event.mdr_report_key || '',
        receiveDate: event.date_received || '',
        eventDate: event.date_of_event || '',
        reportSourceCode: event.source_type || '',
        reporterOccupationCode: event.reporter_occupation_code || '',
        healthProfessional: event.health_professional || '',
        initialReportToFda: event.initial_report_to_fda || '',
        
        // 器械信息
        deviceBrandName: device.brand_name || '',
        deviceGenericName: device.generic_name || '',
        deviceManufacturer: device.manufacturer_d_name || '',
        deviceModelNumber: device.model_number || '',
        deviceCatalogNumber: device.catalog_number || '',
        deviceLotNumber: device.lot_number || '',
        deviceSerialNumber: device.serial_number || '',
        deviceAvailability: device.device_availability || '',
        deviceOperator: device.device_operator || '',
        deviceClass: event.device_class || '',
        productCode: event.product_code || '',
        
        // 问题信息
        productProblems: event.product_problems?.join('; ') || '',
        eventType: event.event_type || '',
        
        // 患者信息
        patientAge: patient.patient_age || '',
        patientAgeUnit: patient.patient_age_unit || '',
        patientSex: patient.patient_sex || '',
        patientWeight: patient.patient_weight || '',
        patientWeightUnit: patient.patient_weight_unit || '',
        patientProblems: patient.patient_problems?.join('; ') || '',
        
        // 事件描述
        eventDescription: mdrText.text || '',
        
        // 原始数据
        rawData: JSON.stringify(event)
      };
    });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new FDAService();
