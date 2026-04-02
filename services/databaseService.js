/**
 * 数据库服务 - SQLite
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class DatabaseService {
  constructor() {
    const dbPath = process.env.DB_PATH || './data/mdr_database.db';
    const dir = path.dirname(dbPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  init() {
    this.db.serialize(() => {
      // 不良事件表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS adverse_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_number TEXT UNIQUE,
          mdr_report_key TEXT,
          receive_date TEXT,
          event_date TEXT,
          competitor_id TEXT,
          category TEXT,
          device_brand_name TEXT,
          device_generic_name TEXT,
          device_manufacturer TEXT,
          device_model_number TEXT,
          device_catalog_number TEXT,
          device_lot_number TEXT,
          device_serial_number TEXT,
          device_availability TEXT,
          device_operator TEXT,
          device_class TEXT,
          product_code TEXT,
          product_problems TEXT,
          event_type TEXT,
          patient_age TEXT,
          patient_sex TEXT,
          patient_weight TEXT,
          patient_problems TEXT,
          event_description TEXT,
          summary TEXT,
          risk_level TEXT,
          raw_data TEXT,
          product_problems_cn TEXT,
          patient_problems_cn TEXT,
          event_description_cn TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 竞品配置表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS competitors (
          id TEXT PRIMARY KEY,
          name TEXT,
          manufacturer TEXT,
          category TEXT,
          keywords TEXT,
          device_class TEXT,
          product_code TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 抓取历史表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS fetch_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          competitor_id TEXT,
          start_date TEXT,
          end_date TEXT,
          records_count INTEGER,
          status TEXT,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 摘要报告表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS summary_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_date TEXT,
          category TEXT,
          competitor_id TEXT,
          total_events INTEGER,
          injury_count INTEGER,
          malfunction_count INTEGER,
          death_count INTEGER,
          top_problems TEXT,
          summary_text TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // ========== 内审管理系统表 ==========
      
      // 内审员档案表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS auditors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          employee_id TEXT UNIQUE,
          department TEXT,
          position TEXT,
          qualification_level TEXT CHECK(qualification_level IN ('实习', '正式', '组长', '高级')),
          certificate_number TEXT,
          certificate_issue_date DATE,
          certificate_expiry_date DATE,
          specialty_areas TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
          total_audits INTEGER DEFAULT 0,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 内审计划表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_number TEXT UNIQUE NOT NULL,
          plan_name TEXT NOT NULL,
          audit_type TEXT CHECK(audit_type IN ('体系审核', '过程审核', '产品审核', '专项审核')),
          audit_scope TEXT,
          audit_criteria TEXT,
          planned_start_date DATE,
          planned_end_date DATE,
          actual_start_date DATE,
          actual_end_date DATE,
          lead_auditor_id INTEGER,
          status TEXT DEFAULT 'planning' CHECK(status IN ('planning', 'scheduled', 'in_progress', 'completed', 'closed')),
          purpose TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_auditor_id) REFERENCES auditors(id)
        )
      `);

      // 内审员分配表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_team_members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          plan_id INTEGER NOT NULL,
          auditor_id INTEGER NOT NULL,
          role TEXT CHECK(role IN ('组长', '内审员', '实习内审员')),
          assigned_processes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (plan_id) REFERENCES audit_plans(id),
          FOREIGN KEY (auditor_id) REFERENCES auditors(id),
          UNIQUE(plan_id, auditor_id)
        )
      `);

      // 不符合项表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS nonconformities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nc_number TEXT UNIQUE NOT NULL,
          plan_id INTEGER NOT NULL,
          audit_record_id INTEGER,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT CHECK(category IN ('严重', '一般', '观察项')),
          clause_reference TEXT,
          process_area TEXT,
          evidence TEXT,
          root_cause TEXT,
          correction TEXT,
          corrective_action TEXT,
          preventive_action TEXT,
          responsible_person TEXT,
          due_date DATE,
          completion_date DATE,
          verification_result TEXT,
          verifier_id INTEGER,
          status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'corrected', 'verified', 'closed')),
          attachments TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (plan_id) REFERENCES audit_plans(id),
          FOREIGN KEY (verifier_id) REFERENCES auditors(id)
        )
      `);

      // 内审员经历记录表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS auditor_experience (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          auditor_id INTEGER NOT NULL,
          plan_id INTEGER NOT NULL,
          role TEXT,
          processes_audited TEXT,
          days_count INTEGER DEFAULT 1,
          performance_rating TEXT CHECK(performance_rating IN ('优秀', '良好', '合格', '需改进')),
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (auditor_id) REFERENCES auditors(id),
          FOREIGN KEY (plan_id) REFERENCES audit_plans(id)
        )
      `);

      // 创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_audit_plans_status ON audit_plans(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_auditors_status ON auditors(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_nonconformities_status ON nonconformities(status)`);
    });
    
    // 为已有表添加翻译字段（如果不存在）
    const addColumnIfMissing = (colName) => {
      this.db.run(`ALTER TABLE adverse_events ADD COLUMN ${colName} TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          logger.warn(`添加列 ${colName} 失败: ${err.message}`);
        }
      });
    };
    addColumnIfMissing('product_problems_cn');
    addColumnIfMissing('patient_problems_cn');
    addColumnIfMissing('event_description_cn');
    
    logger.info('Database initialized');
  }

  // 插入或更新不良事件
  async saveAdverseEvent(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO adverse_events (
          report_number, mdr_report_key, receive_date, event_date,
          competitor_id, category, device_brand_name, device_generic_name,
          device_manufacturer, device_model_number, device_catalog_number,
          device_lot_number, device_serial_number, device_availability,
          device_operator, device_class, product_code, product_problems,
          event_type, patient_age, patient_sex, patient_weight,
          patient_problems, event_description, raw_data, updated_at,
          product_problems_cn, patient_problems_cn, event_description_cn
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        data.reportNumber, data.mdrReportKey, data.receiveDate, data.eventDate,
        data.competitorId, data.category, data.deviceBrandName, data.deviceGenericName,
        data.deviceManufacturer, data.deviceModelNumber, data.deviceCatalogNumber,
        data.deviceLotNumber, data.deviceSerialNumber, data.deviceAvailability,
        data.deviceOperator, data.deviceClass, data.productCode, data.productProblems,
        data.eventType, data.patientAge, data.patientSex, data.patientWeight,
        data.patientProblems, data.eventDescription, data.rawData,
        data.productProblemsCn || null, data.patientProblemsCn || null, data.eventDescriptionCn || null
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  // 批量查询已有翻译（避免重复调用翻译API）
  async getExistingTranslations(reportNumbers) {
    if (!reportNumbers.length) return {};
    return new Promise((resolve, reject) => {
      const placeholders = reportNumbers.map(() => '?').join(',');
      const sql = `
        SELECT report_number, product_problems_cn, patient_problems_cn, event_description_cn
        FROM adverse_events
        WHERE report_number IN (${placeholders})
      `;
      this.db.all(sql, reportNumbers, (err, rows) => {
        if (err) reject(err);
        else {
          const map = {};
          rows.forEach(r => {
            // 只有当翻译字段非空时才缓存
            const hasTranslation = (r.product_problems_cn && r.product_problems_cn.trim()) ||
                                   (r.patient_problems_cn && r.patient_problems_cn.trim()) ||
                                   (r.event_description_cn && r.event_description_cn.trim());
            if (hasTranslation) {
              map[r.report_number] = {
                productProblemsCn: r.product_problems_cn || null,
                patientProblemsCn: r.patient_problems_cn || null,
                eventDescriptionCn: r.event_description_cn || null
              };
            }
          });
          resolve(map);
        }
      });
    });
  }

  // 更新单条记录的翻译字段
  async updateEventTranslation(id, translations) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE adverse_events
        SET product_problems_cn = ?, patient_problems_cn = ?, event_description_cn = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      this.db.run(sql, [
        translations.productProblemsCn || null,
        translations.patientProblemsCn || null,
        translations.eventDescriptionCn || null,
        id
      ], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // 获取需要翻译的记录（翻译字段为空的）
  async getUntranslatedEvents(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, product_problems, patient_problems, event_description
        FROM adverse_events
        WHERE (product_problems IS NOT NULL AND product_problems != '' AND (product_problems_cn IS NULL OR product_problems_cn = ''))
           OR (patient_problems IS NOT NULL AND patient_problems != '' AND (patient_problems_cn IS NULL OR patient_problems_cn = ''))
           OR (event_description IS NOT NULL AND event_description != '' AND (event_description_cn IS NULL OR event_description_cn = ''))
        LIMIT ?
      `;
      this.db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 批量保存
  async saveAdverseEventsBatch(events) {
    const results = [];
    for (const event of events) {
      try {
        const result = await this.saveAdverseEvent(event);
        results.push(result);
      } catch (err) {
        logger.error('Save event error:', err.message);
      }
    }
    return results;
  }

  // 查询不良事件
  async getAdverseEvents(filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM adverse_events WHERE 1=1';
      const params = [];

      if (filters.competitorId) {
        sql += ' AND competitor_id = ?';
        params.push(filters.competitorId);
      }
      if (filters.category) {
        sql += ' AND category = ?';
        params.push(filters.category);
      }
      if (filters.eventType) {
        sql += ' AND event_type = ?';
        params.push(filters.eventType);
      }
      if (filters.startDate) {
        sql += ' AND receive_date >= ?';
        // 将日期格式统一转换为 YYYYMMDD（移除连字符）
        const formattedDate = filters.startDate.replace(/-/g, '');
        params.push(formattedDate);
      }
      if (filters.endDate) {
        sql += ' AND receive_date <= ?';
        // 将日期格式统一转换为 YYYYMMDD（移除连字符）
        const formattedDate = filters.endDate.replace(/-/g, '');
        params.push(formattedDate);
      }
      if (filters.keyword) {
        sql += ' AND (product_problems LIKE ? OR patient_problems LIKE ? OR device_brand_name LIKE ?)';
        const kw = `%${filters.keyword}%`;
        params.push(kw, kw, kw);
      }

      sql += ' ORDER BY receive_date DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 根据ID获取单个事件
  async getEventById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM adverse_events WHERE id = ?';
      this.db.get(sql, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // 获取统计信息（按天数）
  async getStatistics(days = 30) {
    return new Promise((resolve, reject) => {
      // 计算日期阈值（格式：YYYYMMDD，与数据库中存储的格式一致）
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);
      const dateStr = thresholdDate.toISOString().split('T')[0].replace(/-/g, '');
      
      const sql = `
        SELECT 
          category,
          competitor_id,
          COUNT(*) as total,
          SUM(CASE WHEN event_type = 'Injury' THEN 1 ELSE 0 END) as injuries,
          SUM(CASE WHEN event_type = 'Malfunction' THEN 1 ELSE 0 END) as malfunctions,
          SUM(CASE WHEN event_type = 'Death' THEN 1 ELSE 0 END) as deaths
        FROM adverse_events
        WHERE receive_date >= ?
        GROUP BY category, competitor_id
        ORDER BY total DESC
      `;
      
      this.db.all(sql, [dateStr], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 获取统计信息（按日期范围）
  async getStatisticsByDateRange(startDate, endDate) {
    return new Promise((resolve, reject) => {
      // 将日期格式统一转换为 YYYYMMDD（移除连字符）
      const formattedStartDate = startDate.replace(/-/g, '');
      const formattedEndDate = endDate.replace(/-/g, '');
      
      const sql = `
        SELECT 
          category,
          competitor_id,
          COUNT(*) as total,
          SUM(CASE WHEN event_type = 'Injury' THEN 1 ELSE 0 END) as injuries,
          SUM(CASE WHEN event_type = 'Malfunction' THEN 1 ELSE 0 END) as malfunctions,
          SUM(CASE WHEN event_type = 'Death' THEN 1 ELSE 0 END) as deaths
        FROM adverse_events
        WHERE receive_date >= ? AND receive_date <= ?
        GROUP BY category, competitor_id
        ORDER BY total DESC
      `;
      
      this.db.all(sql, [formattedStartDate, formattedEndDate], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // 保存抓取历史
  async saveFetchHistory(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO fetch_history (competitor_id, start_date, end_date, records_count, status, message)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        data.competitorId, data.startDate, data.endDate,
        data.recordsCount, data.status, data.message
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // 保存摘要报告
  async saveSummaryReport(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO summary_reports 
        (report_date, category, competitor_id, total_events, injury_count, malfunction_count, death_count, top_problems, summary_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(sql, [
        data.reportDate, data.category, data.competitorId,
        data.totalEvents, data.injuryCount, data.malfunctionCount,
        data.deathCount, JSON.stringify(data.topProblems), data.summaryText
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }

  // 关闭数据库
  close() {
    this.db.close();
  }
}

module.exports = new DatabaseService();
