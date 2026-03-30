const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'mdr_database.db');
const db = new sqlite3.Database(dbPath);

// 总体统计
db.get(`SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN product_problems IS NOT NULL AND product_problems != '' THEN 1 ELSE 0 END) as has_pp_en,
  SUM(CASE WHEN product_problems_cn IS NOT NULL AND product_problems_cn != '' THEN 1 ELSE 0 END) as has_pp_cn,
  SUM(CASE WHEN patient_problems IS NOT NULL AND patient_problems != '' THEN 1 ELSE 0 END) as has_pat_en,
  SUM(CASE WHEN patient_problems_cn IS NOT NULL AND patient_problems_cn != '' THEN 1 ELSE 0 END) as has_pat_cn,
  SUM(CASE WHEN event_description IS NOT NULL AND event_description != '' THEN 1 ELSE 0 END) as has_desc_en,
  SUM(CASE WHEN event_description_cn IS NOT NULL AND event_description_cn != '' THEN 1 ELSE 0 END) as has_desc_cn,
  SUM(CASE WHEN (product_problems_cn IS NULL OR product_problems_cn = '') AND (patient_problems_cn IS NULL OR patient_problems_cn = '') AND (event_description_cn IS NULL OR event_description_cn = '') THEN 1 ELSE 0 END) as no_cn
FROM adverse_events`, (err, row) => {
  if (err) { console.error(err); process.exit(1); }
  console.log('=== 翻译状态统计 ===');
  console.log('总记录数:', row.total);
  console.log('');
  console.log('product_problems (产品问题):');
  console.log('  有英文:', row.has_pp_en, '| 有中文翻译:', row.has_pp_cn, '| 缺翻译:', row.has_pp_en - row.has_pp_cn);
  console.log('patient_problems (患者问题):');
  console.log('  有英文:', row.has_pat_en, '| 有中文翻译:', row.has_pat_cn, '| 缺翻译:', row.has_pat_en - row.has_pat_cn);
  console.log('event_description (事件描述):');
  console.log('  有英文:', row.has_desc_en, '| 有中文翻译:', row.has_desc_cn, '| 缺翻译:', row.has_desc_en - row.has_desc_cn);
  console.log('');
  console.log('完全无中文翻译的记录:', row.no_cn, '/', row.total);

  // 看几条未翻译的样例
  db.all(`SELECT id, report_number, substr(product_problems, 1, 60) as pp, substr(patient_problems, 1, 60) as pat, substr(event_description, 1, 60) as desc FROM adverse_events WHERE (product_problems_cn IS NULL OR product_problems_cn = '') LIMIT 5`, (err, rows) => {
    console.log('\n=== 未翻译样例 (前5条) ===');
    rows.forEach(r => console.log(`ID:${r.id} | ${r.report_number} | pp:${r.pp} | pat:${r.pat} | desc:${r.desc}`));
    db.close();
  });
});
