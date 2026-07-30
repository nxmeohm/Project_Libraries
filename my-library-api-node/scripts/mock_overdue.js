const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'database_libraries'
    });

    try {
        // Change one pending item to borrowed and set its borrow_date to 10 days ago
        const [rows] = await conn.query("SELECT id FROM borrowed WHERE status = 'returned' LIMIT 1");
        if (rows.length > 0) {
            const id = rows[0].id;
            await conn.query("UPDATE borrowed SET status = 'borrowed', borrow_date = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE id = ?", [id]);
            console.log("Mocked item ID " + id + " to be overdue (borrowed 10 days ago).");
        } else {
            console.log("No pending items to mock.");
        }
    } catch(e) {
        console.error(e);
    }
    
    conn.end();
}

run();
