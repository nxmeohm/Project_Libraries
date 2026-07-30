const mysql = require('mysql2/promise');
async function run() {
    const conn = await mysql.createConnection({host:'localhost',user:'root',database:'database_libraries'});
    try {
        await conn.query('ALTER TABLE equipments ADD COLUMN category VARCHAR(50) DEFAULT "อุปกรณ์ทั่วไป"');
        console.log("Added category");
    } catch(e) { console.log(e.message); }
    try {
        await conn.query('ALTER TABLE equipments ADD COLUMN borrow_days INT DEFAULT 7');
        console.log("Added borrow_days");
    } catch(e) { console.log(e.message); }
    conn.end();
}
run();
