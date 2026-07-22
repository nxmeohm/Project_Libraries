const pool = require('./db.js');

async function fix() {
    try {
        await pool.query("ALTER TABLE borrowed MODIFY COLUMN status VARCHAR(50) DEFAULT 'pending'");
        console.log("Altered borrowed.status successfully.");
    } catch(e) {
        console.error("Error altering borrowed.status:", e);
    }
    
    try {
        await pool.query("ALTER TABLE equipment_items MODIFY COLUMN status VARCHAR(50) DEFAULT 'available'");
        console.log("Altered equipment_items.status successfully.");
    } catch(e) {
        console.error("Error altering equipment_items.status:", e);
    }
    
    process.exit(0);
}

fix();
