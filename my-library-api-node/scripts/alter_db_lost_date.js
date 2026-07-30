const pool = require('./db.js');

async function alter() {
    try {
        await pool.query("ALTER TABLE borrowed ADD COLUMN lost_date DATETIME DEFAULT NULL");
        console.log("Column lost_date added successfully");
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') console.log("Column lost_date already exists");
        else console.error(e);
    }

    try {
        await pool.query("ALTER TABLE borrowed ADD COLUMN lost_note TEXT DEFAULT NULL");
        console.log("Column lost_note added successfully");
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') console.log("Column lost_note already exists");
        else console.error(e);
    }
    process.exit(0);
}

alter();
