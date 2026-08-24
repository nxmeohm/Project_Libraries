const mysql = require('mysql2/promise');
require('dotenv').config();

async function testQuery() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'database_libraries',
    });

    try {
        const [rows] = await pool.query(`
            SELECT 
                s.student_id,
                s.name_th as student_name,
                COUNT(b.id) as total_borrows,
                SUM(CASE WHEN b.status = 'returned' THEN 1 ELSE 0 END) as total_returned,
                SUM(CASE WHEN b.status = 'overdue' THEN 1 ELSE 0 END) as total_overdue,
                SUM(CASE WHEN b.status = 'borrowed' THEN 1 ELSE 0 END) as currently_borrowed
            FROM borrowed b
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE 1=1
            GROUP BY b.student_id, s.name_th
            ORDER BY total_borrows DESC
        `);
        console.log("Success:", rows);
    } catch (e) {
        console.error("DB Error:", e);
    }
    process.exit(0);
}
testQuery();
