/**
 * 翻译服务
 * 使用百度翻译免费 API 将不良事件中的英文字段翻译为中文
 * 免费额度：标准版 5万字符/月，认证后 100万字符/月
 * 申请地址：https://fanyi-api.baidu.com
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

class TranslationService {
  constructor() {
    // 百度翻译 API 配置（在 .env 中设置）
    this.appId = process.env.BAIDU_TRANSLATE_APP_ID || '';
    this.secretKey = process.env.BAIDU_TRANSLATE_SECRET_KEY || '';
    this.apiUrl = 'https://fanyi-api.baidu.com/api/trans/vip/translate';
    logger.info(`翻译服务初始化: appId=${this.appId ? this.appId.substring(0, 6) + '...' : '未配置'}, secretKey=${this.secretKey ? '已设置' : '未设置'}`);
  }

  /**
   * 百度翻译 API 签名
   */
  _sign(query, salt) {
    const str = this.appId + query + salt + this.secretKey;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * 翻译单段文本
   * @param {string} text - 待翻译英文文本
   * @returns {string} 中文翻译结果
   */
  async _translateText(text) {
    if (!text || !text.trim()) return null;
    if (!this.appId || !this.secretKey) {
      logger.warn('百度翻译未配置 appId 或 secretKey，跳过翻译');
      return null;
    }

    // 百度翻译单次最大 6000 字符（含 sign），实际文本约 5000 字符安全
    const chunks = this._splitText(text, 4500);
    const translatedChunks = [];

    for (const chunk of chunks) {
      try {
        const salt = Date.now().toString();
        const sign = this._sign(chunk, salt);

        const url = `${this.apiUrl}?q=${encodeURIComponent(chunk)}&from=en&to=zh&appid=${this.appId}&salt=${salt}&sign=${sign}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.error_code) {
          throw new Error(`百度翻译错误: ${data.error_code} - ${data.error_msg}`);
        }

        // 百度返回格式: { trans_result: [{ src, dst }, ...] }
        if (data.trans_result && data.trans_result.length > 0) {
          const translated = data.trans_result.map(r => r.dst).join('');
          translatedChunks.push(translated);
        } else {
          translatedChunks.push(chunk); // 无结果时保留原文
        }

        // 避免请求过快（百度限制 QPS=1 免费版）
        await new Promise(r => setTimeout(r, 550));
      } catch (error) {
        logger.error('百度翻译请求失败:', error.message);
        translatedChunks.push(chunk);
      }
    }

    return translatedChunks.join('');
  }

  /**
   * 翻译单条事件的文本字段
   * @param {Object} event - 包含 product_problems, patient_problems, event_description
   * @returns {Object} { productProblemsCn, patientProblemsCn, eventDescriptionCn }
   */
  async translateEvent(event) {
    const result = {
      productProblemsCn: null,
      patientProblemsCn: null,
      eventDescriptionCn: null
    };

    // 兼容驼峰和蛇形两种命名
    const productProblems = event.productProblems || event.product_problems || '';
    const patientProblems = event.patientProblems || event.patient_problems || '';
    const eventDescription = event.eventDescription || event.event_description || '';

    // 串行翻译（百度免费版 QPS 限制为 1）
    try {
      if (productProblems && productProblems.trim()) {
        result.productProblemsCn = await this._translateText(productProblems);
      }
    } catch (e) {
      logger.error('翻译 productProblems 失败:', e.message);
    }

    try {
      if (patientProblems && patientProblems.trim()) {
        result.patientProblemsCn = await this._translateText(patientProblems);
      }
    } catch (e) {
      logger.error('翻译 patientProblems 失败:', e.message);
    }

    try {
      if (eventDescription && eventDescription.trim()) {
        result.eventDescriptionCn = await this._translateText(eventDescription);
      }
    } catch (e) {
      logger.error('翻译 eventDescription 失败:', e.message);
    }

    return result;
  }

  /**
   * 批量翻译多条事件
   * @param {Array} events - 事件数组
   * @returns {Map} id -> { productProblemsCn, patientProblemsCn, eventDescriptionCn }
   */
  async translateEventBatch(events) {
    if (!events || events.length === 0) {
      return new Map();
    }

    const resultMap = new Map();

    for (const event of events) {
      try {
        const translations = await this.translateEvent(event);
        resultMap.set(event.id || event.reportNumber, translations);
      } catch (error) {
        logger.error(`批量翻译事件 ${event.id} 失败:`, error.message);
      }
    }

    return resultMap;
  }

  /**
   * 将长文本按安全长度分割（在句号、换行处断开）
   */
  _splitText(text, maxLength) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // 在 maxLength 附近找断句点
      let splitPos = remaining.lastIndexOf('. ', maxLength);
      if (splitPos < maxLength / 2) splitPos = remaining.lastIndexOf('\n', maxLength);
      if (splitPos < maxLength / 2) splitPos = remaining.lastIndexOf('; ', maxLength);
      if (splitPos < maxLength / 2) splitPos = maxLength;

      chunks.push(remaining.substring(0, splitPos + 1).trim());
      remaining = remaining.substring(splitPos + 1).trim();
    }

    return chunks;
  }
}

module.exports = new TranslationService();
