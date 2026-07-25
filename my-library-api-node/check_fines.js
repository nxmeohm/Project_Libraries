const mysql=require('mysql2/promise'); 
require('dotenv').config(); 
mysql.createConnection({host:'localhost',user:'root',database:'database_libraries'})
.then(c => c.query('SELECT * FROM borrowed').then(([r])=> { 
    console.log(JSON.stringify(r.filter(x => x.fine_amount > 0 || x.status === "overdue" || x.status === "borrowed"), null, 2)); 
    c.end(); 
}));
