require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const http = require('http');
const { Server } = require('socket.io');
const generateChartData = require('./generate_chart_data');
const mailer = require('./mailer');
const cron = require('node-cron');

// Cron job to check for overdue items every midnight
cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily overdue check...');
    try {
        const sql = `
            SELECT b.id, b.student_id, b.equipment_id, e.name as equipment_name, 
                   s.email as student_email, s.name_th as student_name,
                   b.borrow_date, e.borrow_days
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.status = 'borrowed'
        `;
        const [rows] = await pool.query(sql);
        
        for (const row of rows) {
            const dueDate = new Date(row.borrow_date);
            dueDate.setDate(dueDate.getDate() + (row.borrow_days || 0));
            
            if (new Date() > dueDate) {
                await pool.query("UPDATE borrowed SET status = 'overdue' WHERE id = ?", [row.id]);
                if (row.student_email) {
                    mailer.sendOverdueEmail(row.student_email, row.student_name, row.equipment_name);
                }
                const notifTitle = "แจ้งเตือนอุปกรณ์เลยกำหนดคืน";
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" ที่คุณยืมเลยกำหนดส่งคืนแล้ว กรุณานำมาคืนโดยเร็วที่สุด (มีค่าปรับล่าช้า 20 บาท/วัน)`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
            }
        }
        console.log('[Cron] Overdue check complete.');
    } catch (error) {
        console.error('[Cron] Error checking overdue items:', error);
    }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Expose io to routes
app.set('io', io);

app.use(cors());
app.use(express.json());

// Logger Middleware - ดู log กิจกรรม API ที่ถูกยิงมา
app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
});

// 1. Admin Login
app.post('/api/auth/admin-login', async (req, res) => {
    const { adminCode, password } = req.body;
    if (!adminCode || !password) {
        return res.status(400).json({ success: false, message: "กรุณาส่งข้อมูลให้ครบถ้วน" });
    }

    try {
        const [rows] = await pool.query(
            "SELECT emp_id, citizen_id, name_th, name_en, email, phone FROM employees WHERE emp_id = ? AND citizen_id = ?",
            [adminCode, password]
        );

        if (rows.length > 0) {
            res.json({ success: true, message: "Login successful", data: rows[0] });
        } else {
            res.json({ success: false, message: "รหัส Admin หรือรหัสผ่านไม่ถูกต้อง" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 2. Admin Dashboard
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const response = {
            kpi: { today: 0, returned: 0, overdue: 0, pending: 0, fines: 0 },
            recent_activity: []
        };

        let targetDate = req.query.date;
        if (!targetDate || isNaN(new Date(targetDate).getTime())) {
            targetDate = new Date().toISOString().split('T')[0];
        }

        const [todayRes] = await pool.query("SELECT COUNT(*) as c FROM borrowed WHERE DATE(borrow_date) = ?", [targetDate]);
        response.kpi.today = todayRes[0].c;

        const [returnedRes] = await pool.query("SELECT COUNT(*) as c FROM borrowed WHERE status = 'returned'");
        response.kpi.returned = returnedRes[0].c;

        const [overdueRes] = await pool.query("SELECT COUNT(*) as c FROM borrowed WHERE status = 'overdue'");
        response.kpi.overdue = overdueRes[0].c;

        const [pendingRes] = await pool.query("SELECT COUNT(*) as c FROM borrowed WHERE status = 'pending'");
        response.kpi.pending = pendingRes[0].c;

        const [finesRes] = await pool.query("SELECT SUM(fine_amount) as total FROM borrowed WHERE fine_amount IS NOT NULL AND status IN ('returned', 'fine_paid')");
        response.kpi.fines = finesRes[0].total || 0;

        const sql = `
            SELECT 
                b.id, b.student_id, e.name as equipment_name,
                b.borrow_date, b.return_date, b.status, sp.* 
            FROM borrowed b
            LEFT JOIN student_profiles sp ON b.student_id = sp.student_id
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            ORDER BY b.borrow_date DESC LIMIT 20
        `;
        const [recentRes] = await pool.query(sql);

        response.recent_activity = recentRes.map(row => {
            let student_name = "Unknown";
            if (row.name_th) student_name = row.name_th;
            else if (row.first_name) student_name = `${row.first_name} ${row.last_name || ''}`;
            else if (row.name) student_name = row.name;
            else student_name = `Student ${row.student_id}`;

            return {
                id: row.id,
                student_id: row.student_id,
                student_name: student_name.trim(),
                equipment_name: row.equipment_name,
                borrow_date: row.borrow_date,
                return_date: row.return_date,
                status: row.status
            };
        });

        response.chartData = await generateChartData(pool, targetDate);

        res.json({ success: true, data: response });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 3. Admin Get Requests
app.get('/api/admin/requests', async (req, res) => {
    try {
        const sql = `
            SELECT 
                b.id, b.student_id, e.name as equipment_name, e.equipment_id, e.price, e.borrow_days,
                b.borrow_date, b.return_date, b.status, b.fine_amount, sp.* 
            FROM borrowed b
            LEFT JOIN student_profiles sp ON b.student_id = sp.student_id
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            ORDER BY b.borrow_date DESC
        `;
        const [rows] = await pool.query(sql);

        const requests = rows.map(row => {
            let student_name = "Unknown";
            if (row.name_th) student_name = row.name_th;
            else if (row.first_name) student_name = `${row.first_name} ${row.last_name || ''}`;
            else if (row.name) student_name = row.name;
            else student_name = `Student ${row.student_id}`;
            
            let calculated_fine = 0;
            let overdue_days = 0;
            if (row.status === 'overdue' || row.status === 'borrowed') {
                const dueDate = new Date(row.borrow_date);
                dueDate.setDate(dueDate.getDate() + (row.borrow_days || 0));
                // Set both dates to midnight to calculate full days accurately
                dueDate.setHours(0,0,0,0);
                const now = new Date();
                now.setHours(0,0,0,0);
                if (now > dueDate) {
                    const diffTime = Math.abs(now - dueDate);
                    overdue_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    calculated_fine = overdue_days * 20;
                }
            } else if (row.status === 'returned' || row.status === 'fine_paid') {
                calculated_fine = parseFloat(row.fine_amount) || 0;
            }

            return {
                id: row.id,
                student_id: row.student_id,
                student_name: student_name.trim(),
                equipment_name: row.equipment_name,
                equipment_code: row.equipment_id,
                price: row.price,
                borrow_date: row.borrow_date,
                return_date: row.return_date,
                status: row.status,
                fine_amount: calculated_fine,
                overdue_days: overdue_days
            };
        });

        res.json({ success: true, data: requests });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 4. Admin Update Request Status
app.post('/api/admin/update-request', async (req, res) => {
    const { id, action, fine } = req.body;
    if (!id || !action) return res.status(400).json({ success: false, message: "Missing data" });

    let new_status = "";
    if (action === 'approve') new_status = "borrowed";
    else if (action === 'reject') new_status = "rejected";
    else if (action === 'return') new_status = "returned";
    else if (action === 'lost') new_status = "damaged_lost";
    else if (action === 'fine_paid') new_status = "fine_paid";
    else return res.status(400).json({ success: false, message: "Invalid action" });

    try {
        // Fetch detailed borrow info for email
        const [borrowInfoRes] = await pool.query(`
            SELECT b.status, b.equipment_id, e.name as equipment_name, 
                   s.email as student_email, s.name_th as student_name 
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.id = ?
        `, [parseInt(id)]);
        const borrowInfo = borrowInfoRes.length > 0 ? borrowInfoRes[0] : null;

        if (action === 'return' || action === 'reject' || action === 'lost') {
            if (borrowInfo) {
                // If it was already returned/rejected, don't free another item
                if (borrowInfo.status !== 'returned' && borrowInfo.status !== 'rejected' && borrowInfo.status !== 'damaged_lost') {
                    const equip_id = borrowInfo.equipment_id;
                    // Free one item
                    const [item] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'borrowed' LIMIT 1", [equip_id]);
                    if (item.length > 0) {
                        if (action === 'lost') {
                            await pool.query("UPDATE equipment_items SET status = 'damaged_lost' WHERE item_id = ?", [item[0].item_id]);
                        } else {
                            await pool.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [item[0].item_id]);
                        }
                    }
                }
            }
        }
        
        if (action === 'return') {
            if (fine && parseFloat(fine) > 0) {
                await pool.query("UPDATE borrowed SET status = ?, return_date = NOW(), fine_amount = ? WHERE id = ?", [new_status, parseFloat(fine), parseInt(id)]);
                if (borrowInfo && borrowInfo.student_email) {
                    mailer.sendReturnWithFineEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name, fine);
                }
            } else {
                await pool.query("UPDATE borrowed SET status = ?, return_date = NOW() WHERE id = ?", [new_status, parseInt(id)]);
                if (borrowInfo && borrowInfo.student_email) {
                    mailer.sendReturnEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                }
            }
        } else if (action === 'lost') {
            await pool.query("UPDATE borrowed SET status = ?, return_date = NOW(), fine_amount = ? WHERE id = ?", [new_status, parseFloat(fine || 0), parseInt(id)]);
            if (borrowInfo && borrowInfo.student_email) {
                mailer.sendFineEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name, fine || 0);
                const notifTitle = "แจ้งเตือนค่าปรับอุปกรณ์";
                const notifMsg = `อุปกรณ์ "${borrowInfo.equipment_name}" สูญหาย/ชำรุดเสียหาย คุณมียอดค่าปรับที่ต้องชำระจำนวน ${fine || 0} บาท ติดต่อบรรณารักษ์ด่วน`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
            }
        } else if (action === 'fine_paid') {
            await pool.query("UPDATE borrowed SET status = ? WHERE id = ?", [new_status, parseInt(id)]);
            
            if (borrowInfo) {
                // Restore damaged equipment back to available
                const equip_id = borrowInfo.equipment_id;
                const [lostItem] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'damaged_lost' LIMIT 1", [equip_id]);
                if (lostItem.length > 0) {
                    await pool.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [lostItem[0].item_id]);
                }
                
                if (borrowInfo.student_email) {
                mailer.sendFinePaidEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                const notifTitle = "ชำระค่าปรับสำเร็จ";
                const notifMsg = `ขอบคุณครับ/ค่ะ ระบบได้รับยอดชำระค่าปรับสำหรับอุปกรณ์ "${borrowInfo.equipment_name}" เรียบร้อยแล้ว`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
                }
            }
        } else {
            await pool.query("UPDATE borrowed SET status = ? WHERE id = ?", [new_status, parseInt(id)]);
            if (action === 'approve' && borrowInfo && borrowInfo.student_email) {
                mailer.sendApprovalEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
            }
        }
        
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: `Status updated to ${new_status}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Manual Notifications POST
app.post('/api/admin/notifications', async (req, res) => {
    const { target, title, message } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, message: "Missing data" });

    try {
        let emails = [];
        if (target === 'all') {
            const [users] = await pool.query("SELECT email FROM student_profiles WHERE email IS NOT NULL AND email != ''");
            emails = users.map(u => u.email);
        } else {
            emails.push(target);
        }

        // Save notification to database for UI display
        await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'announcement')", [target, title, message]);
        req.app.get('io').emit('data_updated');

        if (emails.length === 0) {
            return res.json({ success: true, message: "บันทึกประกาศสำเร็จ แต่ไม่มีผู้ใช้ที่มีอีเมลให้ส่ง" });
        }

        // Respond immediately so the UI doesn't freeze
        res.json({ success: true, message: "บันทึกประกาศสำเร็จ ระบบกำลังทยอยส่งอีเมลในพื้นหลัง" });

        // Send emails in the background
        setImmediate(async () => {
            try {
                for (const email of emails) {
                    await mailer.sendManualNotification(email, title, message);
                }
            } catch (e) {
                console.error("Background email error:", e);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Get Notifications GET
app.get('/api/admin/notifications', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM notifications WHERE type = 'announcement' ORDER BY created_at DESC");
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 5. Admin Get Equipments
app.get('/api/admin/equipments', async (req, res) => {
    try {
        const sql = "SELECT e.*, (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity FROM equipments e ORDER BY e.equipment_id DESC";
        const [rows] = await pool.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 6. Admin Add Equipment
app.post('/api/admin/equipments', async (req, res) => {
    const { name, kit_code, category, total_quantity, available_quantity, borrow_days, price, description, status: equipStatus } = req.body;
    try {
        const sql = `INSERT INTO equipments (kit_code, name, total_quantity, description, usage_type, price, category, borrow_days, status) 
                     VALUES (?, ?, ?, ?, 'internal', ?, ?, ?, ?)`;
        const [result] = await pool.query(sql, [
            kit_code, name, parseInt(total_quantity), description, parseFloat(price), category, parseInt(borrow_days), equipStatus || 'ใช้งานได้'
        ]);
        const equipment_id = result.insertId;

        const total = parseInt(total_quantity);
        const avail = parseInt(available_quantity);
        for(let i=0; i < total; i++) {
            const status = (i < avail) ? 'available' : 'borrowed';
            const seq = `c.${i+1}`;
            const asset = `new-${Date.now()}-${i}`;
            await pool.query(`INSERT INTO equipment_items (equipment_id, sequence_code, full_asset_code, status) VALUES (?, ?, ?, ?)`, [equipment_id, seq, asset, status]);
        }
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "เพิ่มอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Update Equipment
app.put('/api/admin/equipments/:id', async (req, res) => {
    const { id } = req.params;
    const { name, kit_code, category, total_quantity, available_quantity, borrow_days, price, description, status: equipStatus } = req.body;
    try {
        const sql = `UPDATE equipments SET kit_code=?, name=?, total_quantity=?, description=?, price=?, category=?, borrow_days=?, status=? WHERE equipment_id=?`;
        await pool.query(sql, [
            kit_code, name, parseInt(total_quantity), description, parseFloat(price), category, parseInt(borrow_days), equipStatus || 'ใช้งานได้', parseInt(id)
        ]);
        
        // Count existing items
        const [existing] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ?", [parseInt(id)]);
        const total = parseInt(total_quantity);
        
        if (total > existing.length) {
            // Need to add more
            const diff = total - existing.length;
            for(let i=0; i < diff; i++) {
                const seq = `c.${existing.length + i + 1}`;
                const asset = `add-${Date.now()}-${i}`;
                await pool.query("INSERT INTO equipment_items (equipment_id, sequence_code, full_asset_code, status) VALUES (?, ?, ?, 'available')", [parseInt(id), seq, asset]);
            }
        } else if (total < existing.length) {
            // Need to remove some available items (simplistic approach)
            const diff = existing.length - total;
            await pool.query("DELETE FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT ?", [parseInt(id), diff]);
        }
        
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "แก้ไขอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Delete Equipment
app.delete('/api/admin/equipments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [borrows] = await pool.query("SELECT id FROM borrowed WHERE equipment_id = ? LIMIT 1", [parseInt(id)]);
        if (borrows.length > 0) {
            return res.json({ success: false, message: "ไม่สามารถลบได้เนื่องจากมีประวัติการยืมในระบบ" });
        }
        
        await pool.query("DELETE FROM equipment_items WHERE equipment_id = ?", [parseInt(id)]);
        await pool.query("DELETE FROM equipments WHERE equipment_id = ?", [parseInt(id)]);
        
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "ลบอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Get Users
app.get('/api/admin/users', async (req, res) => {
    try {
        const sql = `
            SELECT 
                sp.student_id, 
                sp.name_th, 
                sp.department, 
                sp.education_status,
                sp.student_img,
                sp.email,
                sp.phone_number AS phone
            FROM users u
            JOIN student_profiles sp ON u.user_id = sp.user_id
            WHERE u.role = 'student'
            ORDER BY u.created_at DESC
        `;
        const [rows] = await pool.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Get Notifications
app.get('/api/admin/notifications', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM notifications ORDER BY created_at DESC");
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// Admin Delete Equipment
app.delete('/api/admin/equipments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM equipments WHERE equipment_id = ?", [parseInt(id)]);
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "ลบอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});


// Admin Get User History
app.get('/api/admin/user-history/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const [userRows] = await pool.query("SELECT * FROM student_profiles WHERE student_id = ?", [studentId]);
        if (userRows.length === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลนักศึกษา" });
        }
        const user = userRows[0];

        const [historyRows] = await pool.query(`
            SELECT b.*, e.name as equipment_name, e.kit_code 
            FROM borrowed b 
            JOIN equipments e ON b.equipment_id = e.equipment_id 
            WHERE b.student_id = ? 
            ORDER BY b.borrow_date DESC
        `, [studentId]);

        res.json({ success: true, data: { user, history: historyRows } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// --- Mobile App Endpoints ---

// 1. login.php
app.post('/api/login.php', async (req, res) => {
    const { studentId, citizenId } = req.body;
    if (!studentId || !citizenId) return res.status(400).json({ success: false, message: "Missing data" });
    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [studentId, citizenId]);
        if (rows.length > 0) res.json({ success: true, message: "Login successful" });
        else res.json({ success: false, message: "Invalid credentials" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 2. get_student.php
app.get('/api/get_student.php', async (req, res) => {
    const id = req.query.id || 'B6600001';
    try {
        const [rows] = await pool.query("SELECT * FROM student_profiles WHERE student_id = ?", [id]);
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// 3. get_equipments.php
app.get('/api/get_equipments.php', async (req, res) => {
    try {
        const sql = "SELECT e.*, (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity FROM equipments e";
        const [rows] = await pool.query(sql);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// 4. get_detail.php
app.get('/api/get_detail.php', async (req, res) => {
    const id = parseInt(req.query.id);
    try {
        const sql = "SELECT e.*, (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity FROM equipments e WHERE e.equipment_id = ?";
        const [rows] = await pool.query(sql, [id]);
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// 4.5. get_notifications.php
app.get('/api/get_notifications.php', async (req, res) => {
    const studentId = req.query.student_id;
    const type = req.query.type || 'announcement';
    try {
        let email = '';
        if (studentId) {
            const [users] = await pool.query("SELECT email FROM student_profiles WHERE student_id = ?", [studentId]);
            if (users.length > 0) email = users[0].email;
        }

        const sql = "SELECT * FROM notifications WHERE (target = 'all' OR target = ?) AND type = ? ORDER BY created_at DESC";
        const [rows] = await pool.query(sql, [email, type]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Notifications Error:", error);
        res.status(500).json({ success: false, error: "Database Error" });
    }
});

// 5. get_borrowed.php
app.get('/api/get_borrowed.php', async (req, res) => {
    const student_id = req.query.student_id;
    if (!student_id) return res.status(400).json({ success: false, message: "student_id is required" });
    try {
        const sql = "SELECT b.id, b.student_id, b.equipment_id, b.borrow_date, b.return_date, b.status, e.name, e.equipment_img FROM borrowed b LEFT JOIN equipments e ON b.equipment_id = e.equipment_id WHERE b.student_id = ? ORDER BY b.borrow_date DESC";
        const [rows] = await pool.query(sql, [student_id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 6. checkout.php
app.post('/api/checkout.php', async (req, res) => {
    const { student_id, equipment_id } = req.body;
    if (!student_id || !equipment_id) return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });
    
    try {
        const [check] = await pool.query("SELECT id FROM borrowed WHERE student_id = ? AND equipment_id = ? AND status IN ('borrowed', 'pending')", [student_id, equipment_id]);
        if (check.length > 0) return res.json({ success: false, message: "นักศึกษา 1 คน ยืม/จองอุปกรณ์ชิ้นนี้ได้สูงสุด 1 ชิ้น" });
        
        const [avail] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT 1", [equipment_id]);
        if (avail.length === 0) return res.json({ success: false, message: "อุปกรณ์ชิ้นนี้ไม่มีให้ยืมในขณะนี้" });
        
        const item_id = avail[0].item_id;
        
        await pool.query("INSERT INTO borrowed (student_id, equipment_id, borrow_date, status) VALUES (?, ?, NOW(), 'pending')", [student_id, equipment_id]);
        await pool.query("UPDATE equipment_items SET status = 'borrowed' WHERE item_id = ?", [item_id]);
        
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "ส่งคำขอยืมอุปกรณ์สำเร็จ กรุณารอการอนุมัติ" });
    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({ success: false, message: "ไม่สามารถทำรายการได้" });
    }
});

// 7. cancel_request.php
app.post('/api/cancel_request.php', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Missing id" });

    try {
        // Find the equipment_id first
        const [borrowed] = await pool.query("SELECT equipment_id, status FROM borrowed WHERE id = ?", [parseInt(id)]);
        if (borrowed.length > 0) {
            if (borrowed[0].status === 'borrowed') {
                const equip_id = borrowed[0].equipment_id;
                // Free one item
                const [item] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'borrowed' LIMIT 1", [equip_id]);
                if (item.length > 0) {
                    await pool.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [item[0].item_id]);
                }
            }
            // Mark as cancelled (we use 'rejected' as it's equivalent in admin view)
            await pool.query("UPDATE borrowed SET status = 'rejected' WHERE id = ?", [parseInt(id)]);
            req.app.get('io').emit('data_updated');
            res.json({ success: true, message: "ยกเลิกรายการเรียบร้อยแล้ว" });
        } else {
            res.status(404).json({ success: false, message: "Request not found" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
