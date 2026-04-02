/**
 * 内审管理系统 API 路由
 */
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

// 配置文件上传
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/pdf'
        ];
        const allowedExts = ['.docx', '.doc', '.pdf'];
        const fileExt = '.' + file.originalname.split('.').pop().toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExts.includes(fileExt)) {
            cb(null, true);
        } else {
            cb(new Error('只支持Word文档(.doc, .docx)和PDF格式'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB限制
});

// 初始化内审数据库
const auditDbPath = process.env.AUDIT_DB_PATH || './data/audit_database.db';
const auditDbDir = path.dirname(auditDbPath);

if (!fs.existsSync(auditDbDir)) {
    fs.mkdirSync(auditDbDir, { recursive: true });
}

const db = new sqlite3.Database(auditDbPath);

// 初始化数据库表
function initDatabase() {
    const schemaPath = path.join(__dirname, '../database/audit_schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // 使用exec一次性执行所有语句
    db.exec(schema, (err) => {
        if (err && !err.message.includes('already exists')) {
            logger.error('初始化内审数据库表失败:', err.message);
        } else {
            logger.info('内审数据库表初始化成功');
        }
    });
    logger.info('内审数据库初始化完成');
}

// 启动时初始化
initDatabase();

// ==================== 内审员管理 ====================

// 获取内审员列表
router.get('/api/auditors', (req, res) => {
    const { status, keyword } = req.query;
    let sql = `SELECT * FROM auditors WHERE 1=1`;
    const params = [];
    
    if (status) {
        sql += ` AND status = ?`;
        params.push(status);
    }
    if (keyword) {
        sql += ` AND (name LIKE ? OR employee_id LIKE ? OR department LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            logger.error('获取内审员列表失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取单个内审员
router.get('/api/auditors/:id', (req, res) => {
    const sql = `SELECT * FROM auditors WHERE id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: '内审员不存在' });
        }
        res.json({ data: row });
    });
});

// 创建内审员
router.post('/api/auditors', (req, res) => {
    const {
        name, employee_id, department, position,
        qualification_level, certificate_number,
        certificate_issue_date, certificate_expiry_date,
        specialty_areas, notes
    } = req.body;
    
    const sql = `INSERT INTO auditors 
        (name, employee_id, department, position, qualification_level, 
         certificate_number, certificate_issue_date, certificate_expiry_date, 
         specialty_areas, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        name, employee_id, department, position, qualification_level,
        certificate_number, certificate_issue_date, certificate_expiry_date,
        JSON.stringify(specialty_areas), notes
    ], function(err) {
        if (err) {
            logger.error('创建内审员失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: '创建成功' });
    });
});

// 更新内审员
router.put('/api/auditors/:id', (req, res) => {
    const {
        name, employee_id, department, position,
        qualification_level, certificate_number,
        certificate_issue_date, certificate_expiry_date,
        specialty_areas, status, notes
    } = req.body;
    
    const sql = `UPDATE auditors SET 
        name = ?, employee_id = ?, department = ?, position = ?,
        qualification_level = ?, certificate_number = ?,
        certificate_issue_date = ?, certificate_expiry_date = ?,
        specialty_areas = ?, status = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
    
    db.run(sql, [
        name, employee_id, department, position,
        qualification_level, certificate_number,
        certificate_issue_date, certificate_expiry_date,
        JSON.stringify(specialty_areas), status, notes,
        req.params.id
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '更新成功' });
    });
});

// 删除内审员
router.delete('/api/auditors/:id', (req, res) => {
    db.run(`DELETE FROM auditors WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '已删除' });
    });
});

// ==================== 内审计划管理 ====================

// 获取内审计划列表
router.get('/api/audit-plans', (req, res) => {
    const { status, year, keyword } = req.query;
    let sql = `
        SELECT p.*, a.name as lead_auditor_name 
        FROM audit_plans p 
        LEFT JOIN auditors a ON p.lead_auditor_id = a.id 
        WHERE 1=1`;
    const params = [];
    
    if (status) {
        sql += ` AND p.status = ?`;
        params.push(status);
    }
    if (year) {
        sql += ` AND strftime('%Y', p.planned_start_date) = ?`;
        params.push(year);
    }
    if (keyword) {
        sql += ` AND (p.plan_number LIKE ? OR p.plan_name LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`);
    }
    
    sql += ` ORDER BY p.planned_start_date DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取单个内审计划
router.get('/api/audit-plans/:id', (req, res) => {
    const planSql = `
        SELECT p.*, a.name as lead_auditor_name 
        FROM audit_plans p 
        LEFT JOIN auditors a ON p.lead_auditor_id = a.id 
        WHERE p.id = ?`;
    
    db.get(planSql, [req.params.id], (err, plan) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!plan) {
            return res.status(404).json({ error: '内审计划不存在' });
        }
        
        // 获取内审组成员
        const teamSql = `
            SELECT t.*, a.name, a.employee_id, a.department, a.qualification_level
            FROM audit_team_members t
            JOIN auditors a ON t.auditor_id = a.id
            WHERE t.plan_id = ?`;
        
        db.all(teamSql, [req.params.id], (err, team) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ data: { ...plan, team } });
        });
    });
});

// 创建内审计划
router.post('/api/audit-plans', (req, res) => {
    const {
        plan_number, plan_name, audit_type, audit_scope,
        audit_criteria, planned_start_date, planned_end_date,
        lead_auditor_id, purpose, team_members
    } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const planSql = `INSERT INTO audit_plans
            (plan_number, plan_name, audit_type, audit_scope, audit_criteria,
             planned_start_date, planned_end_date, lead_auditor_id, purpose)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        db.run(planSql, [
            plan_number, plan_name, audit_type, audit_scope, audit_criteria,
            planned_start_date, planned_end_date, lead_auditor_id, purpose
        ], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }

            const planId = this.lastID;

            // 添加内审组成员
            if (team_members && team_members.length > 0) {
                const teamSql = `INSERT INTO audit_team_members (plan_id, auditor_id, role, assigned_processes) VALUES (?, ?, ?, ?)`;
                const stmt = db.prepare(teamSql);

                team_members.forEach(member => {
                    stmt.run([planId, member.auditor_id, member.role, JSON.stringify(member.assigned_processes)]);
                });
                stmt.finalize();
            }

            db.run('COMMIT');
            res.json({ id: planId, message: '创建成功' });
        });
    });
});

// ==================== 内审组成员管理 ====================

// 添加内审组成员
router.post('/api/audit-team-members', (req, res) => {
    const { plan_id, auditor_id, role, assigned_processes } = req.body;

    const sql = `INSERT INTO audit_team_members (plan_id, auditor_id, role, assigned_processes)
                 VALUES (?, ?, ?, ?)`;

    db.run(sql, [plan_id, auditor_id, role || '内审员', JSON.stringify(assigned_processes || [])], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: '添加成功' });
    });
});

// 删除内审组成员
router.delete('/api/audit-team-members/:id', (req, res) => {
    db.run(`DELETE FROM audit_team_members WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '已删除' });
    });
});

// 更新内审计划状态
router.put('/api/audit-plans/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(
        `UPDATE audit_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: '状态已更新' });
        }
    );
});

// 删除内审计划（级联删除相关数据）
router.delete('/api/audit-plans/:id', (req, res) => {
    const planId = req.params.id;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 删除相关的不符合项
        db.run(`DELETE FROM nonconformities WHERE plan_id = ?`, [planId], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }

            // 删除内审组成员
            db.run(`DELETE FROM audit_team_members WHERE plan_id = ?`, [planId], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }

                // 删除审核记录
                db.run(`DELETE FROM audit_records WHERE plan_id = ?`, [planId], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: err.message });
                    }

                    // 删除审核日程
                    db.run(`DELETE FROM audit_schedule WHERE plan_id = ?`, [planId], (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                        }

                        // 最后删除计划本身
                        db.run(`DELETE FROM audit_plans WHERE id = ?`, [planId], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: err.message });
                            }

                            db.run('COMMIT');
                            res.json({ message: '已删除' });
                        });
                    });
                });
            });
        });
    });
});

// ==================== 不符合项管理 ====================

// 获取不符合项列表
router.get('/api/nonconformities', (req, res) => {
    const { status, plan_id, category } = req.query;
    let sql = `
        SELECT n.*, p.plan_number, p.plan_name
        FROM nonconformities n
        LEFT JOIN audit_plans p ON n.plan_id = p.id
        WHERE 1=1`;
    const params = [];
    
    if (status) {
        sql += ` AND n.status = ?`;
        params.push(status);
    }
    if (plan_id) {
        sql += ` AND n.plan_id = ?`;
        params.push(plan_id);
    }
    if (category) {
        sql += ` AND n.category = ?`;
        params.push(category);
    }
    
    sql += ` ORDER BY n.created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取单个不符合项
router.get('/api/nonconformities/:id', (req, res) => {
    const sql = `
        SELECT n.*, p.plan_number, p.plan_name
        FROM nonconformities n
        LEFT JOIN audit_plans p ON n.plan_id = p.id
        WHERE n.id = ?`;
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: '不符合项不存在' });
        }
        res.json({ data: row });
    });
});

// 创建不符合项
router.post('/api/nonconformities', (req, res) => {
    const {
        nc_number, plan_id, title, description, category,
        clause_reference, process_area, evidence,
        root_cause, correction, corrective_action, preventive_action,
        responsible_person, due_date
    } = req.body;
    
    const sql = `INSERT INTO nonconformities 
        (nc_number, plan_id, title, description, category,
         clause_reference, process_area, evidence,
         root_cause, correction, corrective_action, preventive_action,
         responsible_person, due_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        nc_number, plan_id, title, description, category,
        clause_reference, process_area, evidence,
        root_cause, correction, corrective_action, preventive_action,
        responsible_person, due_date
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: '创建成功' });
    });
});

// 更新不符合项
router.put('/api/nonconformities/:id', (req, res) => {
    const {
        title, description, category, clause_reference, process_area,
        root_cause, correction, corrective_action, preventive_action,
        responsible_person, due_date, completion_date,
        verification_result, status
    } = req.body;

    const sql = `UPDATE nonconformities SET
        title = ?, description = ?, category = ?, clause_reference = ?, process_area = ?,
        root_cause = ?, correction = ?, corrective_action = ?, preventive_action = ?,
        responsible_person = ?, due_date = ?, completion_date = ?,
        verification_result = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;

    db.run(sql, [
        title, description, category, clause_reference, process_area,
        root_cause, correction, corrective_action, preventive_action,
        responsible_person, due_date, completion_date,
        verification_result, status, req.params.id
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '更新成功' });
    });
});

// 删除不符合项
router.delete('/api/nonconformities/:id', (req, res) => {
    db.run(`DELETE FROM nonconformities WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '已删除' });
    });
});

// ==================== 统计数据 ====================

// 获取仪表盘统计数据
router.get('/api/dashboard', (req, res) => {
    const stats = {};
    
    // 内审计划统计
    db.get(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
        FROM audit_plans WHERE strftime('%Y', planned_start_date) = strftime('%Y', 'now')`, 
    (err, row) => {
        if (!err) stats.plans = row;
        
        // 不符合项统计
        db.get(`SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
            SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
            SUM(CASE WHEN category = '严重' THEN 1 ELSE 0 END) as major,
            SUM(CASE WHEN category = '一般' THEN 1 ELSE 0 END) as minor
            FROM nonconformities`, 
        (err, row) => {
            if (!err) stats.nc = row;
            
            // 内审员统计
            db.get(`SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
                FROM auditors`, 
            (err, row) => {
                if (!err) stats.auditors = row;
                res.json({ data: stats });
            });
        });
    });
});

// 生成内审计划编号
router.get('/api/generate-plan-number', (req, res) => {
    const year = new Date().getFullYear();
    db.get(
        `SELECT COUNT(*) as count FROM audit_plans WHERE strftime('%Y', created_at) = ?`,
        [String(year)],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const num = String((row?.count || 0) + 1).padStart(3, '0');
            res.json({ number: `IA-${year}-${num}` });
        }
    );
});

// 生成不符合项编号
router.get('/api/generate-nc-number/:planId', (req, res) => {
    db.get(
        `SELECT plan_number FROM audit_plans WHERE id = ?`,
        [req.params.planId],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: '计划不存在' });
            }
            db.get(
                `SELECT COUNT(*) as count FROM nonconformities WHERE plan_id = ?`,
                [req.params.planId],
                (err, ncRow) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    const num = String((ncRow?.count || 0) + 1).padStart(2, '0');
                    res.json({ number: `${row.plan_number}-NC${num}` });
                }
            );
        }
    );
});

// ==================== 外审CAPA管理 ====================

// 获取外审条目列表
router.get('/api/external-audits', (req, res) => {
    const { keyword, status } = req.query;
    let sql = `SELECT * FROM external_audits WHERE 1=1`;
    const params = [];
    
    if (keyword) {
        sql += ` AND (audit_type LIKE ? OR project_name LIKE ? OR project_number LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
        sql += ` AND status = ?`;
        params.push(status);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            logger.error('获取外审条目列表失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取单个外审条目
router.get('/api/external-audits/:id', (req, res) => {
    const sql = `SELECT * FROM external_audits WHERE id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: '外审条目不存在' });
        }
        res.json({ data: row });
    });
});

// 创建外审条目
router.post('/api/external-audits', (req, res) => {
    const {
        serial_number, audit_type, project_name, project_number, product_brand,
        responsible_department, audit_date, correction_due_date, quality_engineer, notes
    } = req.body;
    
    const sql = `INSERT INTO external_audits 
        (serial_number, audit_type, project_name, project_number, product_brand, 
         responsible_department, audit_date, correction_due_date, quality_engineer, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        serial_number, audit_type, project_name, project_number, product_brand,
        responsible_department, audit_date, correction_due_date, quality_engineer, notes
    ], function(err) {
        if (err) {
            logger.error('创建外审条目失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ id: this.lastID, message: '创建成功' });
    });
});

// 更新外审条目
router.put('/api/external-audits/:id', (req, res) => {
    const {
        serial_number, audit_type, project_name, project_number, product_brand,
        responsible_department, audit_date, correction_due_date, quality_engineer, notes
    } = req.body;
    
    const sql = `UPDATE external_audits SET 
        serial_number = ?, audit_type = ?, project_name = ?, project_number = ?, product_brand = ?,
        responsible_department = ?, audit_date = ?, correction_due_date = ?, quality_engineer = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
    
    db.run(sql, [
        serial_number, audit_type, project_name, project_number, product_brand,
        responsible_department, audit_date, correction_due_date, quality_engineer, notes, req.params.id
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '更新成功' });
    });
});

// 生成流水编号
router.get('/api/generate-serial-number', (req, res) => {
    const year = new Date().getFullYear();
    db.get(
        `SELECT COUNT(*) as count FROM external_audits WHERE strftime('%Y', created_at) = ?`,
        [String(year)],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            const num = String((row?.count || 0) + 1).padStart(3, '0');
            res.json({ number: `EXT-${year}-${num}` });
        }
    );
});

// 删除外审条目（级联删除CAPA）
router.delete('/api/external-audits/:id', (req, res) => {
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`DELETE FROM external_capa WHERE external_audit_id = ?`, [req.params.id], (err) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: err.message });
            }
            
            db.run(`DELETE FROM external_audits WHERE id = ?`, [req.params.id], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                
                db.run('COMMIT');
                res.json({ message: '删除成功' });
            });
        });
    });
});

// ==================== 外审CAPA ====================

// 获取CAPA列表（按外审条目）
router.get('/api/external-capa', (req, res) => {
    const { external_audit_id, status } = req.query;
    let sql = `SELECT * FROM external_capa WHERE 1=1`;
    const params = [];
    
    if (external_audit_id) {
        sql += ` AND external_audit_id = ?`;
        params.push(external_audit_id);
    }
    if (status) {
        sql += ` AND status = ?`;
        params.push(status);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            logger.error('获取CAPA列表失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取所有CAPA列表（带完整筛选）
router.get('/api/external-capa/all', (req, res) => {
    const { keyword, status, category, brand, audit_date_start, audit_date_end } = req.query;
    
    // 判断是否有日期筛选（排除空字符串）
    const hasDateFilter = (audit_date_start && audit_date_start.trim() !== '') || 
                          (audit_date_end && audit_date_end.trim() !== '');
    
    // 明确指定所有字段，使用别名避免冲突
    const selectFields = `
        c.id, c.external_audit_id, c.capa_number, c.title, c.description, c.category,
        c.clause_reference, c.responsible_person, c.due_date, c.status,
        e.project_number, e.product_brand, e.project_name, e.audit_type, 
        e.audit_date as audit_date`;
    
    // 如果有日期筛选，使用INNER JOIN确保只返回符合条件的
    // 如果没有日期筛选，使用LEFT JOIN返回所有CAPA
    let sql = hasDateFilter ? 
        `SELECT ${selectFields}
         FROM external_capa c
         INNER JOIN external_audits e ON c.external_audit_id = e.id
         WHERE e.audit_date IS NOT NULL` :
        `SELECT ${selectFields}
         FROM external_capa c
         LEFT JOIN external_audits e ON c.external_audit_id = e.id
         WHERE 1=1`;
    
    const params = [];
    
    if (keyword) {
        sql += ` AND (c.capa_number LIKE ? OR c.description LIKE ? OR c.title LIKE ?)`;
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (status) {
        sql += ` AND c.status = ?`;
        params.push(status);
    }
    if (category) {
        sql += ` AND c.category = ?`;
        params.push(category);
    }
    if (brand) {
        sql += ` AND e.product_brand = ?`;
        params.push(brand);
    }
    
    // 审核日期筛选
    if (audit_date_start && audit_date_start.trim() !== '') {
        sql += ` AND e.audit_date >= ?`;
        params.push(audit_date_start);
    }
    if (audit_date_end && audit_date_end.trim() !== '') {
        sql += ` AND e.audit_date <= ?`;
        params.push(audit_date_end);
    }
    
    sql += ` ORDER BY c.created_at DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            logger.error('获取CAPA列表失败:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ data: rows });
    });
});

// 获取单个CAPA
router.get('/api/external-capa/:id', (req, res) => {
    const sql = `SELECT * FROM external_capa WHERE id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            return res.status(404).json({ error: 'CAPA不存在' });
        }
        res.json({ data: row });
    });
});

// 生成CAPA编号
router.get('/api/generate-capa-number/:auditId', (req, res) => {
    db.get(
        `SELECT project_number FROM external_audits WHERE id = ?`,
        [req.params.auditId],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: '外审条目不存在' });
            }
            db.get(
                `SELECT COUNT(*) as count FROM external_capa WHERE external_audit_id = ?`,
                [req.params.auditId],
                (err, capaRow) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    const num = String((capaRow?.count || 0) + 1).padStart(2, '0');
                    res.json({ number: `${row.project_number}-CAPA${num}` });
                }
            );
        }
    );
});

// 创建CAPA
router.post('/api/external-capa', (req, res) => {
    const {
        external_audit_id, capa_number, title, description, category,
        clause_reference, correction, investigation, capa_action,
        responsible_person, due_date, status
    } = req.body;
    
    const sql = `INSERT INTO external_capa 
        (external_audit_id, capa_number, title, description, category,
         clause_reference, correction, investigation, capa_action,
         responsible_person, due_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        external_audit_id, capa_number, title || '', description, category,
        clause_reference, correction, investigation, capa_action,
        responsible_person, due_date, status || 'open'
    ], function(err) {
        if (err) {
            logger.error('创建CAPA失败:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // 更新外审条目的不符合项数量
        db.run(
            `UPDATE external_audits SET nc_count = (SELECT COUNT(*) FROM external_capa WHERE external_audit_id = ?) WHERE id = ?`,
            [external_audit_id, external_audit_id]
        );
        
        res.json({ id: this.lastID, message: '创建成功' });
    });
});

// 更新CAPA
router.put('/api/external-capa/:id', (req, res) => {
    const {
        capa_number, description, category, clause_reference,
        correction, investigation, capa_action,
        responsible_person, due_date, verification_result, status
    } = req.body;
    
    const sql = `UPDATE external_capa SET 
        capa_number = ?, description = ?, category = ?, clause_reference = ?,
        correction = ?, investigation = ?, capa_action = ?,
        responsible_person = ?, due_date = ?, verification_result = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`;
    
    db.run(sql, [
        capa_number, description, category, clause_reference,
        correction, investigation, capa_action,
        responsible_person, due_date, verification_result, status,
        req.params.id
    ], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: '更新成功' });
    });
});

// 删除CAPA
router.delete('/api/external-capa/:id', (req, res) => {
    // 先获取external_audit_id
    db.get(`SELECT external_audit_id FROM external_capa WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) {
            return res.status(500).json({ error: err.message || 'CAPA不存在' });
        }
        
        const external_audit_id = row.external_audit_id;
        
        db.run(`DELETE FROM external_capa WHERE id = ?`, [req.params.id], function(err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // 更新外审条目的不符合项数量
            db.run(
                `UPDATE external_audits SET nc_count = (SELECT COUNT(*) FROM external_capa WHERE external_audit_id = ?) WHERE id = ?`,
                [external_audit_id, external_audit_id]
            );
            
            res.json({ message: '删除成功' });
        });
    });
});

// ==================== 文件上传解析 ====================

// 上传并解析CAPA文档
router.post('/api/parse-capa-document', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请上传文件' });
        }

        const filePath = req.file.path;
        const fileExt = '.' + req.file.originalname.split('.').pop().toLowerCase();
        let text = '';

        // 根据文件类型解析
        if (fileExt === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text;
        } else {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value;
        }

        // 删除临时文件
        fs.unlinkSync(filePath);

        // 解析文档内容，匹配字段
        const parsedData = parseCAPADocument(text);

        res.json({ success: true, data: parsedData });
    } catch (error) {
        logger.error('解析CAPA文档失败:', error);
        res.status(500).json({ error: '解析文档失败: ' + error.message });
    }
});

// 解析CAPA文档内容
function parseCAPADocument(text) {
    const data = {
        capa_number: '',
        title: '',
        description: '',
        category: '一般',
        clause_reference: '',
        responsible_person: '',
        correction: '',
        investigation: '',
        capa_action: '',
        due_date: ''
    };

    // 清理文本，去除多余空格和换行
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 匹配CAPA编号 - 从No.字段提取
    const noMatch = cleanText.match(/No\.\s*:?\s*([A-Za-z0-9\-\/]+)/i);
    if (noMatch) {
        data.capa_number = noMatch[1].trim();
    }

    // 匹配不符合事实描述/不合格事实描述
    const descPatterns = [
        /不符合事实[描述\s:：]*([^，。]+[^。]*[。]?)/i,
        /不合格事实[描述\s:：]*([^，。]+[^。]*[。]?)/i,
        /问题描述[\s:：]*([^，。]+[^。]*[。]?)/i
    ];
    for (const pattern of descPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            data.description = match[1].trim().substring(0, 500);
            break;
        }
    }

    // 匹配严重程度
    const categoryMatch = cleanText.match(/严重程度[\s:：]*(严重|一般|观察项)/i);
    if (categoryMatch) {
        data.category = categoryMatch[1].trim();
    }

    // 匹配条款引用
    const clauseMatch = cleanText.match(/条款[引用\s:：]*([A-Za-z0-9\.\s]+)/i);
    if (clauseMatch) {
        data.clause_reference = clauseMatch[1].trim();
    }

    // 匹配责任人
    const responsibleMatch = cleanText.match(/责任[人部门\s:：]*([^\s，。]+)/i);
    if (responsibleMatch) {
        data.responsible_person = responsibleMatch[1].trim();
    }

    // 匹配纠正
    const correctionMatch = cleanText.match(/纠正[\s:：]*([^，。]+[^。]*[。]?)/i);
    if (correctionMatch) {
        data.correction = correctionMatch[1].trim().substring(0, 500);
    }

    // 匹配不合格调查
    const investigationMatch = cleanText.match(/不合格调查[\s:：]*([^，。]+[^。]*[。]?)/i);
    if (investigationMatch) {
        data.investigation = investigationMatch[1].trim().substring(0, 500);
    }

    // 匹配纠正/预防措施CAPA
    const capaActionPatterns = [
        /纠正\/预防措施[\s:：]*([^，。]+[^。]*[。]?)/i,
        /纠正预防措施[\s:：]*([^，。]+[^。]*[。]?)/i,
        /CAPA措施[\s:：]*([^，。]+[^。]*[。]?)/i
    ];
    for (const pattern of capaActionPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            data.capa_action = match[1].trim().substring(0, 500);
            break;
        }
    }

    // 匹配日期
    const datePatterns = [
        /整改完成日期[\s:：]*(\d{4}[\-/年]\d{1,2}[\-/月]\d{1,2})/i,
        /截止日期[\s:：]*(\d{4}[\-/年]\d{1,2}[\-/月]\d{1,2})/i,
        /回复截止日期[\s:：]*(\d{4}[\-/年]\d{1,2}[\-/月]\d{1,2})/i
    ];
    for (const pattern of datePatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            // 标准化日期格式
            let dateStr = match[1].replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-');
            data.due_date = dateStr;
            break;
        }
    }

    return data;
}

// ==================== AI CAPA 分析 ====================

const OpenAI = require('openai');

// AI分析CAPA
router.post('/api/capa-analysis', async (req, res) => {
    try {
        const { capas } = req.body;
        
        if (!capas || capas.length === 0) {
            return res.status(400).json({ error: '没有CAPA数据可分析' });
        }
        
        // 统计分析
        const stats = {
            total: capas.length,
            byStatus: {},
            byCategory: {},
            byBrand: {},
            overdue: 0
        };
        
        capas.forEach(capa => {
            // 按状态统计
            const status = capa.status || 'open';
            stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
            
            // 按严重程度统计
            const category = capa.category || '未分类';
            stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
            
            // 按品牌统计
            const brand = capa.product_brand || '未知';
            stats.byBrand[brand] = (stats.byBrand[brand] || 0) + 1;
            
            // 检查是否逾期
            if (capa.due_date && new Date(capa.due_date) < new Date() && capa.status !== 'closed' && capa.status !== 'verified') {
                stats.overdue++;
            }
        });
        
        // 调用AI分析
        const analysis = await analyzeCAPAWithAI(capas, stats);
        
        // 生成HTML报告
        const html = generateAnalysisHTML(stats, analysis, capas);
        
        res.json({ html, stats, analysis });
    } catch (error) {
        logger.error('CAPA分析失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI分析函数
async function analyzeCAPAWithAI(capas, stats) {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const model = process.env.OPENAI_MODEL || 'gpt-4';
    
    if (!apiKey || !baseUrl) {
        return {
            summary: 'AI服务未配置，仅显示基础统计分析',
            rootCauses: [],
            recommendations: []
        };
    }
    
    const openai = new OpenAI({ apiKey, baseURL: baseUrl });
    
    // 准备CAPA数据摘要
    const capaSummary = capas.slice(0, 20).map(c => ({
        编号: c.capa_number,
        问题描述: (c.description || c.title || '').substring(0, 100),
        严重程度: c.category,
        状态: c.status,
        品牌: c.product_brand,
        责任人: c.responsible_person
    }));
    
    const prompt = `你是医疗器械质量管理专家，正在为最高管理层准备年度管理评审的CAPA分析报告。请基于ISO 13485:2016和医疗器械生产质量管理规范，从风险管理和持续改进角度分析以下CAPA数据。

## 数据来源
- 筛选范围: 外审CAPA数据
- 统计时间: ${new Date().toLocaleDateString('zh-CN')}

## CAPA统计数据
- CAPA总数: ${stats.total}
- 按状态分布: ${JSON.stringify(stats.byStatus)}
- 按严重程度分布: ${JSON.stringify(stats.byCategory)}
- 按产品品牌分布: ${JSON.stringify(stats.byBrand)}
- 逾期未关闭: ${stats.overdue}

## CAPA明细（前20条）
${JSON.stringify(capaSummary, null, 2)}

## 分析要求
请从管理评审角度，生成一页PPT报告，包含以下内容：

### 1. 执行摘要（50-80字）
简明扼要总结CAPA整体情况，突出关键发现和风险点，便于管理层快速把握要点。

### 2. 关键数据展示
- 列出3-4个关键指标（如完成率、逾期率、高风险占比等）
- 每个指标需说明其对质量体系的影响

### 3. 主要问题分析
识别2-3个系统性问题或薄弱环节：
- 问题类别（如设计开发、供应商管理、生产过程等）
- 发生频次和严重程度
- 典型案例（1个具体案例）

### 4. 改进措施建议
提出2-3条有针对性的体系改进建议：
- 建议措施要具体可执行
- 明确责任部门和预期完成时间
- 说明预期改进效果

## 输出格式
请严格按以下JSON格式返回：
{
  "summary": "执行摘要内容",
  "keyMetrics": [
    {"name": "指标名称", "value": "数值", "impact": "对质量体系的影响"}
  ],
  "majorIssues": [
    {"category": "问题类别", "frequency": "发生频次", "severity": "严重程度", "example": "典型案例"}
  ],
  "improvements": [
    {"action": "改进措施", "department": "责任部门", "deadline": "预期时间", "benefit": "预期效果"}
  ]
}`;
    
    try {
        const response = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000
        });
        
        const content = response.choices[0].message.content;
        // 提取JSON部分
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        return {
            summary: 'AI分析结果解析失败',
            keyMetrics: [],
            majorIssues: [],
            improvements: []
        };
    } catch (error) {
        logger.error('AI分析失败:', error);
        return {
            summary: `AI分析失败: ${error.message}`,
            keyMetrics: [],
            majorIssues: [],
            improvements: []
        };
    }
}

// 生成HTML报告
function generateAnalysisHTML(stats, analysis, capas) {
    return `
    <div class="space-y-6">
        <!-- 执行摘要 -->
        <div class="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-6 text-white">
            <h3 class="text-lg font-bold mb-3 flex items-center">
                <i class="ri-file-list-3-line mr-2"></i>执行摘要
            </h3>
            <p class="leading-relaxed">${analysis.summary || '暂无分析结果'}</p>
        </div>
        
        <!-- 关键指标 -->
        ${analysis.keyMetrics && analysis.keyMetrics.length > 0 ? `
        <div>
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="ri-bar-chart-box-line text-blue-600 mr-2"></i>关键指标
            </h3>
            <div class="grid grid-cols-4 gap-4">
                ${analysis.keyMetrics.map(metric => `
                <div class="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
                    <div class="text-2xl font-bold text-blue-600 mb-1">${metric.value}</div>
                    <div class="text-sm font-medium text-gray-800 mb-1">${metric.name}</div>
                    <div class="text-xs text-gray-600">${metric.impact}</div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : `
        <div class="grid grid-cols-4 gap-4">
            <div class="bg-blue-50 rounded-lg p-4">
                <div class="text-3xl font-bold text-blue-600">${stats.total}</div>
                <div class="text-sm text-gray-600">CAPA总数</div>
            </div>
            <div class="bg-red-50 rounded-lg p-4">
                <div class="text-3xl font-bold text-red-600">${stats.byStatus['open'] || 0}</div>
                <div class="text-sm text-gray-600">待处理</div>
            </div>
            <div class="bg-yellow-50 rounded-lg p-4">
                <div class="text-3xl font-bold text-yellow-600">${stats.overdue}</div>
                <div class="text-sm text-gray-600">逾期未完成</div>
            </div>
            <div class="bg-green-50 rounded-lg p-4">
                <div class="text-3xl font-bold text-green-600">${stats.byStatus['closed'] || 0}</div>
                <div class="text-sm text-gray-600">已关闭</div>
            </div>
        </div>
        `}
        
        <!-- 主要问题 -->
        ${analysis.majorIssues && analysis.majorIssues.length > 0 ? `
        <div>
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="ri-error-warning-line text-red-600 mr-2"></i>主要问题分析
            </h3>
            <div class="space-y-3">
                ${analysis.majorIssues.map(issue => `
                <div class="border-l-4 border-red-500 bg-red-50 rounded-r-lg p-4">
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-bold text-gray-900">${issue.category}</span>
                        <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">${issue.severity}</span>
                    </div>
                    <div class="text-sm text-gray-700 mb-2">
                        <span class="font-medium">频次:</span> ${issue.frequency}
                    </div>
                    <div class="text-sm text-gray-600 bg-white rounded p-2">
                        <span class="font-medium">案例:</span> ${issue.example}
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        <!-- 改进措施 -->
        ${analysis.improvements && analysis.improvements.length > 0 ? `
        <div>
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center">
                <i class="ri-lightbulb-line text-green-600 mr-2"></i>改进措施建议
            </h3>
            <div class="space-y-3">
                ${analysis.improvements.map((imp, i) => `
                <div class="border-l-4 border-green-500 bg-green-50 rounded-r-lg p-4">
                    <div class="flex items-start gap-3">
                        <span class="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm flex-shrink-0">${i + 1}</span>
                        <div class="flex-1">
                            <div class="font-medium text-gray-900 mb-1">${imp.action}</div>
                            <div class="flex gap-4 text-xs text-gray-600">
                                <span><i class="ri-building-line mr-1"></i>${imp.department}</span>
                                <span><i class="ri-time-line mr-1"></i>${imp.deadline}</span>
                            </div>
                            <div class="text-sm text-gray-700 mt-2 bg-white rounded p-2">
                                <span class="font-medium text-green-700">预期效果:</span> ${imp.benefit}
                            </div>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>
        ` : ''}
        
        <!-- 分布图表 -->
        <div class="grid grid-cols-2 gap-6">
            <div>
                <h3 class="text-lg font-bold text-gray-800 mb-3">按严重程度分布</h3>
                <div class="space-y-2">
                    ${Object.entries(stats.byCategory).map(([cat, count]) => {
                        const percent = ((count / stats.total) * 100).toFixed(1);
                        const colorClass = cat === '严重' ? 'bg-red-500' : cat === '一般' ? 'bg-yellow-500' : 'bg-blue-500';
                        return `
                        <div class="flex items-center gap-2">
                            <span class="w-20 text-sm text-gray-600">${cat}</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-4">
                                <div class="${colorClass} h-4 rounded-full" style="width: ${percent}%"></div>
                            </div>
                            <span class="text-sm text-gray-600">${count} (${percent}%)</span>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div>
                <h3 class="text-lg font-bold text-gray-800 mb-3">按品牌分布</h3>
                <div class="space-y-2">
                    ${Object.entries(stats.byBrand).map(([brand, count]) => {
                        const percent = ((count / stats.total) * 100).toFixed(1);
                        const colorClass = brand === 'MT' ? 'bg-blue-500' : 'bg-green-500';
                        return `
                        <div class="flex items-center gap-2">
                            <span class="w-20 text-sm text-gray-600">${brand}</span>
                            <div class="flex-1 bg-gray-200 rounded-full h-4">
                                <div class="${colorClass} h-4 rounded-full" style="width: ${percent}%"></div>
                            </div>
                            <span class="text-sm text-gray-600">${count} (${percent}%)</span>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    </div>
    `;
}

// 生成PPT
router.post('/api/capa-analysis/ppt', async (req, res) => {
    try {
        const { capas } = req.body;
        
        if (!capas || capas.length === 0) {
            return res.status(400).json({ error: '没有CAPA数据' });
        }
        
        // 统计数据
        const stats = { total: capas.length, byStatus: {}, byCategory: {}, byBrand: {}, overdue: 0 };
        capas.forEach(capa => {
            stats.byStatus[capa.status || 'open'] = (stats.byStatus[capa.status || 'open'] || 0) + 1;
            stats.byCategory[capa.category || '未分类'] = (stats.byCategory[capa.category || '未分类'] || 0) + 1;
            stats.byBrand[capa.product_brand || '未知'] = (stats.byBrand[capa.product_brand || '未知'] || 0) + 1;
            if (capa.due_date && new Date(capa.due_date) < new Date() && !['closed', 'verified'].includes(capa.status)) stats.overdue++;
        });
        
        // AI分析
        const analysis = await analyzeCAPAWithAI(capas, stats);
        
        // 使用pptxgenjs生成PPT
        const PptxGenJS = require('pptxgenjs');
        const pptx = new PptxGenJS();
        pptx.author = 'CAPA管理系统';
        pptx.title = 'CAPA分析报告';
        pptx.subject = '管理评审CAPA分析';
        pptx.layout = 'LAYOUT_16x9';
        
        // 一页报告：重新设计更简洁的布局
        let slide = pptx.addSlide();
        
        // 顶部标题栏 - 深蓝色渐变
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 1.1, fill: { color: '1E3A8A' } });
        slide.addText('CAPA分析报告', { x: 0.4, y: 0.25, w: 5, h: 0.5, fontSize: 26, bold: true, color: 'FFFFFF' });
        slide.addText(`管理评审汇报 | ${new Date().toLocaleDateString('zh-CN')}`, { x: 0.4, y: 0.7, w: 5, h: 0.3, fontSize: 11, color: '93C5FD' });
        
        // 左侧区域 - 执行摘要 + 关键指标
        // 执行摘要
        slide.addText('执行摘要', { x: 0.4, y: 1.3, w: 2, h: 0.3, fontSize: 11, bold: true, color: '1E3A8A' });
        slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: 1.6, w: 4.6, h: 1.1, fill: { color: 'F0F7FF' }, line: { color: 'BFDBFE', width: 1 } });
        const summaryText = (analysis.summary || '暂无分析结果').substring(0, 120);
        slide.addText(summaryText, { x: 0.55, y: 1.7, w: 4.3, h: 0.9, fontSize: 10, color: '1E40AF', valign: 'top' });
        
        // 关键指标 - 横向排列4个
        slide.addText('关键指标', { x: 0.4, y: 2.9, w: 2, h: 0.3, fontSize: 11, bold: true, color: '1E3A8A' });
        
        const metrics = analysis.keyMetrics && analysis.keyMetrics.length > 0 ? analysis.keyMetrics : [
            { name: 'CAPA总数', value: String(stats.total), color: '2563EB' },
            { name: '待处理', value: String(stats.byStatus['open'] || 0), color: 'DC2626' },
            { name: '逾期', value: String(stats.overdue), color: 'EA580C' },
            { name: '已关闭', value: String(stats.byStatus['closed'] || 0), color: '059669' }
        ];
        
        metrics.slice(0, 4).forEach((metric, i) => {
            const xPos = 0.4 + i * 1.2;
            slide.addShape(pptx.ShapeType.rect, { x: xPos, y: 3.2, w: 1.1, h: 0.9, fill: { color: 'FFFFFF' }, line: { color: metric.color || 'E2E8F0', width: 2 } });
            slide.addText(metric.value, { x: xPos, y: 3.25, w: 1.1, h: 0.45, fontSize: 22, bold: true, color: metric.color || '1E3A8A', align: 'center' });
            slide.addText(metric.name, { x: xPos, y: 3.7, w: 1.1, h: 0.35, fontSize: 9, color: '64748B', align: 'center' });
        });
        
        // 右侧区域 - 主要问题
        const rightX = 5.3;
        slide.addText('主要问题', { x: rightX, y: 1.3, w: 2, h: 0.3, fontSize: 11, bold: true, color: 'DC2626' });
        
        if (analysis.majorIssues && analysis.majorIssues.length > 0) {
            analysis.majorIssues.slice(0, 3).forEach((issue, i) => {
                const yPos = 1.6 + i * 0.85;
                slide.addShape(pptx.ShapeType.rect, { x: rightX, y: yPos, w: 4.3, h: 0.8, fill: { color: 'FEF2F2' }, line: { color: 'FECACA', width: 1 } });
                // 类别 + 严重程度
                slide.addText(`${i + 1}. ${issue.category}`, { x: rightX + 0.15, y: yPos + 0.08, w: 2.5, h: 0.28, fontSize: 11, bold: true, color: '991B1B' });
                slide.addText(`[${issue.severity}]`, { x: rightX + 2.7, y: yPos + 0.08, w: 1.4, h: 0.25, fontSize: 9, color: 'DC2626', align: 'right' });
                // 案例（精简）
                const exampleText = issue.example ? (issue.example.length > 35 ? issue.example.substring(0, 35) + '...' : issue.example) : '';
                slide.addText(exampleText, { x: rightX + 0.15, y: yPos + 0.38, w: 4.0, h: 0.35, fontSize: 9, color: '7F1D1D' });
            });
        } else {
            slide.addShape(pptx.ShapeType.rect, { x: rightX, y: 1.6, w: 4.3, h: 0.8, fill: { color: 'F0FDF4' }, line: { color: 'BBF7D0', width: 1 } });
            slide.addText('✓ 无重大系统性问题', { x: rightX, y: 1.85, w: 4.3, h: 0.3, fontSize: 11, color: '166534', align: 'center' });
        }
        
        // 底部区域 - 改进措施（横跨整个宽度）
        slide.addText('改进措施建议', { x: 0.4, y: 4.2, w: 2, h: 0.3, fontSize: 11, bold: true, color: '059669' });
        
        if (analysis.improvements && analysis.improvements.length > 0) {
            const colWidth = 3.0;
            analysis.improvements.slice(0, 3).forEach((imp, i) => {
                const xPos = 0.4 + i * 3.1;
                slide.addShape(pptx.ShapeType.rect, { x: xPos, y: 4.5, w: colWidth, h: 1.1, fill: { color: 'F0FDF4' }, line: { color: '86EFAC', width: 1 } });
                // 序号圆圈
                slide.addShape(pptx.ShapeType.ellipse, { x: xPos + 0.1, y: 4.55, w: 0.35, h: 0.35, fill: { color: '059669' } });
                slide.addText(String(i + 1), { x: xPos + 0.1, y: 4.6, w: 0.35, h: 0.25, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center' });
                // 措施标题（精简）
                const actionText = imp.action.length > 30 ? imp.action.substring(0, 30) + '...' : imp.action;
                slide.addText(actionText, { x: xPos + 0.55, y: 4.58, w: 2.35, h: 0.35, fontSize: 10, bold: true, color: '064E3B' });
                // 部门和截止时间
                slide.addText(`${imp.department} | ${imp.deadline}`, { x: xPos + 0.1, y: 4.95, w: 2.8, h: 0.25, fontSize: 8, color: '166534' });
                // 预期效果
                const benefitText = imp.benefit.length > 40 ? imp.benefit.substring(0, 40) + '...' : imp.benefit;
                slide.addText(benefitText, { x: xPos + 0.1, y: 5.2, w: 2.8, h: 0.35, fontSize: 9, color: '047857' });
            });
        } else {
            slide.addShape(pptx.ShapeType.rect, { x: 0.4, y: 4.5, w: 9.2, h: 1.1, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 } });
            slide.addText('暂无具体改进建议', { x: 0.4, y: 4.9, w: 9.2, h: 0.3, fontSize: 11, color: '64748B', align: 'center' });
        }
        
        // 底部页脚
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.8, w: 10, h: 0.1, fill: { color: 'E2E8F0' } });
        slide.addText('ISO 13485:2016 质量管理评审 | 机密文件', { x: 0.4, y: 5.9, w: 9, h: 0.3, fontSize: 8, color: '94A3B8' });
        
        // 生成并返回
        const buffer = await pptx.write({ outputType: 'nodebuffer' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
        res.send(buffer);
    } catch (error) {
        logger.error('生成PPT失败:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
