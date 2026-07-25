const fs = require('fs');
const content = fs.readFileSync('src/pages/Home.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, i) => {
    if (l.includes('แจ้งเตือนผู้ใช้งาน') || l.includes('แจ้งเตือน') || l.includes('ส่งถึง')) {
        console.log(`Line ${i+1}: ${l.trim()}`);
    }
});
