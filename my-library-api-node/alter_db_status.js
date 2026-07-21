const pool = require('./db.js');
async function alter() {
    try {
        await pool.query("ALTER TABLE equipments ADD COLUMN status VARCHAR(50) DEFAULT 'ใช้งานได้'");
        console.log("Column added");
    } catch(e) {
        if(e.code === 'ER_DUP_FIELDNAME') console.log("Column already exists");
        else console.error(e);
    }
    process.exit(0);
}
alter();
