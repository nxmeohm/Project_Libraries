const db = require('./db');
async function run() {
    try {
        await db.query("ALTER TABLE notifications ADD COLUMN type VARCHAR(20) DEFAULT 'announcement'");
        console.log("Column type added to notifications");
        
        // Update existing non-announcements to alert
        await db.query("UPDATE notifications SET type = 'alert' WHERE title LIKE '%ค่าปรับ%'");
        console.log("Updated fine notices to type alert");
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log("Column type already exists");
            await db.query("UPDATE notifications SET type = 'alert' WHERE title LIKE '%ค่าปรับ%'");
        } else {
            console.error(e);
        }
    }
    process.exit();
}
run();
