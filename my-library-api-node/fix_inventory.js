const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        database: process.env.DB_NAME || 'database_libraries'
    });
    
    // Find all items that are stuck in 'damaged_lost' or 'borrowed'
    const [items] = await conn.query("SELECT * FROM equipment_items WHERE status != 'available'");
    console.log('Unavailable items:', items);

    // If we find any 'damaged_lost', we can restore them to 'available' since fine was paid
    await conn.query("UPDATE equipment_items SET status = 'available' WHERE status = 'damaged_lost'");
    
    console.log('Restored stuck items to available.');
    process.exit(0);
}

run();
