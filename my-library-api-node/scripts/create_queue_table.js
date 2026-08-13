const pool = require('../db');

async function createQueueTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS equipment_queue (
                id INT AUTO_INCREMENT PRIMARY KEY,
                equipment_id INT NOT NULL,
                student_id VARCHAR(20) NOT NULL,
                position INT NOT NULL,
                status ENUM('waiting', 'called', 'completed', 'expired', 'cancelled') DEFAULT 'waiting',
                queued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                called_at DATETIME DEFAULT NULL,
                expires_at DATETIME DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_equipment_status (equipment_id, status),
                INDEX idx_student_status (student_id, status),
                INDEX idx_expires (status, expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Table equipment_queue created successfully');
    } catch (e) {
        console.error('❌ Error creating table:', e.message);
    }

    process.exit(0);
}

createQueueTable();
