const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/audit_database.db');
const db = new sqlite3.Database(dbPath);

// 添加新字段
const columns = [
    { name: 'investigation', type: 'TEXT' },
    { name: 'capa_action', type: 'TEXT' }
];

columns.forEach(col => {
    db.run(`ALTER TABLE external_capa ADD COLUMN ${col.name} ${col.type}`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log(`列 ${col.name} 已存在`);
            } else {
                console.error(`添加列 ${col.name} 失败:`, err.message);
            }
        } else {
            console.log(`成功添加列 ${col.name}`);
        }
    });
});

// 检查表结构
setTimeout(() => {
    db.all("PRAGMA table_info(external_capa)", (err, rows) => {
        if (err) {
            console.error('查询表结构失败:', err.message);
        } else {
            console.log('\n当前表结构:');
            rows.forEach(row => {
                console.log(`  ${row.name}: ${row.type}`);
            });
        }
        db.close();
    });
}, 500);
