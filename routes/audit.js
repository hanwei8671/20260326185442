/**
 * 内审管理系统 API 路由
 */
const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

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
    
    // 分割并执行每个CREATE语句
    const statements = schema.split(';').filter(s => s.trim());
    statements.forEach(sql => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('already exists')) {
                logger.error('初始化内审数据库表失败:', err.message);
            }
        });
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

module.exports = router;
