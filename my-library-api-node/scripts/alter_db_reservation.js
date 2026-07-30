const pool = require('./db.js');

async function alter() {
    try {
        await pool.query("ALTER TABLE borrowed ADD COLUMN pickup_time DATETIME DEFAULT NULL");
        console.log("Column pickup_time added successfully");
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') console.log("Column pickup_time already exists");
        else console.error(e);
    }

    try {
        await pool.query("ALTER TABLE borrowed ADD COLUMN reservation_expires_at DATETIME DEFAULT NULL");
        console.log("Column reservation_expires_at added successfully");
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') console.log("Column reservation_expires_at already exists");
        else console.error(e);
    }
    process.exit(0);
}

alter();
