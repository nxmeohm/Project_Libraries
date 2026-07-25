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
        await conn.query('ALTER TABLE borrowed ADD COLUMN fine_amount DECIMAL(10,2) DEFAULT 0');
        console.log("Added fine_amount column to borrowed table.");
    } catch(e) { 
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("fine_amount column already exists.");
        } else {
            console.log("Error adding column:", e.message);
        }
    }
    
    conn.end();
}

run();
