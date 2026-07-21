const generateChartData = async (pool, targetDate) => {
    // 1. Daily
    const [dailyRes] = await pool.query(`
        SELECT WEEKDAY(borrow_date) as wd, COUNT(*) as c 
        FROM borrowed 
        WHERE borrow_date >= DATE(?) - INTERVAL 6 DAY AND borrow_date <= DATE(?) + INTERVAL 1 DAY
        GROUP BY wd
    `, [targetDate, targetDate]);
    const dailyMap = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
    dailyRes.forEach(r => dailyMap[r.wd] = r.c);
    const daily = [
        { l: 'จ.', v: dailyMap[0] }, { l: 'อ.', v: dailyMap[1] }, { l: 'พ.', v: dailyMap[2] },
        { l: 'พฤ.', v: dailyMap[3] }, { l: 'ศ.', v: dailyMap[4] }, { l: 'ส.', v: dailyMap[5] }, { l: 'อา.', v: dailyMap[6] }
    ];

    // 2. Monthly
    const [monthlyRes] = await pool.query(`
        SELECT MONTH(borrow_date) as m, COUNT(*) as c 
        FROM borrowed 
        WHERE YEAR(borrow_date) = YEAR(?) 
        GROUP BY m
    `, [targetDate]);
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthlyMap = {};
    for (let i=1; i<=12; i++) monthlyMap[i] = 0;
    monthlyRes.forEach(r => monthlyMap[r.m] = r.c);
    const month = monthNames.map((name, idx) => ({ l: name, v: monthlyMap[idx+1] }));

    // 3. Yearly
    const [yearlyRes] = await pool.query(`
        SELECT YEAR(borrow_date) as y, COUNT(*) as c 
        FROM borrowed 
        WHERE YEAR(borrow_date) <= YEAR(?)
        GROUP BY y
        ORDER BY y DESC LIMIT 4
    `, [targetDate]);
    let year = yearlyRes.reverse().map(r => ({ l: String(r.y), v: r.c }));
    if(year.length === 0) year.push({ l: String(new Date().getFullYear()), v: 0 });

    return { day: daily, month: month, year: year };
};
module.exports = generateChartData;
