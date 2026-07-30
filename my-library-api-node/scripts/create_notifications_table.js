const db = require('./db');
async function run() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                target VARCHAR(50) DEFAULT 'all',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table created');
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
