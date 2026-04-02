-- 内审管理系统数据库结构

-- 内审员档案表
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
    specialty_areas TEXT,  -- 专业领域，JSON数组
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    total_audits INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 内审计划表
CREATE TABLE IF NOT EXISTS audit_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_number TEXT UNIQUE NOT NULL,
    plan_name TEXT NOT NULL,
    audit_type TEXT CHECK(audit_type IN ('体系审核', '过程审核', '产品审核', '专项审核')),
    audit_scope TEXT,
    audit_criteria TEXT,  -- 审核依据
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
);

-- 内审员分配表（计划-内审员关联）
CREATE TABLE IF NOT EXISTS audit_team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    auditor_id INTEGER NOT NULL,
    role TEXT CHECK(role IN ('组长', '内审员', '实习内审员')),
    assigned_processes TEXT,  -- 分配的审核过程，JSON数组
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES audit_plans(id),
    FOREIGN KEY (auditor_id) REFERENCES auditors(id),
    UNIQUE(plan_id, auditor_id)
);

-- 审核日程表
CREATE TABLE IF NOT EXISTS audit_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    audit_date DATE NOT NULL,
    time_slot TEXT,  -- 时间段
    process_area TEXT,  -- 过程/区域
    auditor_id INTEGER,
    location TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES audit_plans(id),
    FOREIGN KEY (auditor_id) REFERENCES auditors(id)
);

-- 检查表模板
CREATE TABLE IF NOT EXISTS checklist_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    audit_type TEXT,
    version TEXT DEFAULT '1.0',
    content TEXT,  -- JSON格式的检查项列表
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 审核记录表
CREATE TABLE IF NOT EXISTS audit_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    schedule_id INTEGER,
    checklist_item TEXT,
    requirement TEXT,  -- 审核要求
    evidence TEXT,  -- 审核证据
    finding TEXT,  -- 审核发现
    result TEXT CHECK(result IN ('符合', '不符合', '观察项', '不适用')),
    auditor_id INTEGER,
    audit_date DATE,
    attachments TEXT,  -- 附件路径，JSON数组
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES audit_plans(id),
    FOREIGN KEY (schedule_id) REFERENCES audit_schedule(id),
    FOREIGN KEY (auditor_id) REFERENCES auditors(id)
);

-- 不符合项表
CREATE TABLE IF NOT EXISTS nonconformities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nc_number TEXT UNIQUE NOT NULL,
    plan_id INTEGER NOT NULL,
    audit_record_id INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT CHECK(category IN ('严重', '一般', '观察项')),
    clause_reference TEXT,  -- 条款引用
    process_area TEXT,
    evidence TEXT,
    root_cause TEXT,
    correction TEXT,  -- 纠正
    corrective_action TEXT,  -- 纠正措施
    preventive_action TEXT,  -- 预防措施
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
    FOREIGN KEY (audit_record_id) REFERENCES audit_records(id),
    FOREIGN KEY (verifier_id) REFERENCES auditors(id)
);

-- 内审员经历记录表
CREATE TABLE IF NOT EXISTS auditor_experience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auditor_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    role TEXT,
    processes_audited TEXT,  -- 审核的过程
    days_count INTEGER DEFAULT 1,
    performance_rating TEXT CHECK(performance_rating IN ('优秀', '良好', '合格', '需改进')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (auditor_id) REFERENCES auditors(id),
    FOREIGN KEY (plan_id) REFERENCES audit_plans(id)
);

-- 外审条目表
CREATE TABLE IF NOT EXISTS external_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE NOT NULL,
    audit_type TEXT NOT NULL,
    project_name TEXT NOT NULL,
    project_number TEXT NOT NULL,
    product_brand TEXT CHECK(product_brand IN ('MT', 'TR')),
    responsible_department TEXT CHECK(responsible_department IN ('设备研发', '耗材研发', '产品管理')),
    audit_date DATE NOT NULL,
    correction_due_date DATE,
    quality_engineer TEXT,
    nc_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 外审CAPA表
CREATE TABLE IF NOT EXISTS external_capa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_audit_id INTEGER NOT NULL,
    capa_number TEXT UNIQUE NOT NULL,
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
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'corrected', 'verified', 'closed')),
    attachments TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (external_audit_id) REFERENCES external_audits(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_audit_plans_status ON audit_plans(status);
CREATE INDEX IF NOT EXISTS idx_audit_plans_dates ON audit_plans(planned_start_date, planned_end_date);
CREATE INDEX IF NOT EXISTS idx_auditors_status ON auditors(status);
CREATE INDEX IF NOT EXISTS idx_nonconformities_status ON nonconformities(status);
CREATE INDEX IF NOT EXISTS idx_nonconformities_plan ON nonconformities(plan_id);
CREATE INDEX IF NOT EXISTS idx_external_audits_status ON external_audits(status);
CREATE INDEX IF NOT EXISTS idx_external_capa_audit ON external_capa(external_audit_id);
CREATE INDEX IF NOT EXISTS idx_external_capa_status ON external_capa(status);
