/**
 * 数据库迁移脚本 - 为external_audits表添加新字段
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'audit_database.db');
const db = new sqlite3.Database(dbPath);

console.log('开始数据库迁移...');

// 检查列是否存在
db.all("PRAGMA table_info(external_audits)", (err, columns) => {
    if (err) {
        console.error('获取表结构失败:', err);
        db.close();
        return;
    }
    
    const columnNames = columns.map(c => c.name);
    console.log('当前列:', columnNames);
    
    // 添加 serial_number 列
    if (!columnNames.includes('serial_number')) {
        db.run("ALTER TABLE external_audits ADD COLUMN serial_number TEXT", (err) => {
            if (err) {
                console.error('添加 serial_number 列失败:', err.message);
            } else {
                console.log('成功添加 serial_number 列');
            }
        });
    } else {
        console.log('serial_number 列已存在');
    }
    
    // 添加 responsible_department 列
    if (!columnNames.includes('responsible_department')) {
        db.run("ALTER TABLE external_audits ADD COLUMN responsible_department TEXT", (err) => {
            if (err) {
                console.error('添加 responsible_department 列失败:', err.message);
            } else {
                console.log('成功添加 responsible_department 列');
            }
            
            // 完成后关闭数据库
            setTimeout(() => {
                db.close();
                console.log('数据库迁移完成');
            }, 500);
        });
    } else {
        console.log('responsible_department 列已存在');
        setTimeout(() => {
            db.close();
            console.log('数据库迁移完成');
        }, 500);
    }
});
