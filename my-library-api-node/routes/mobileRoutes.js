const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const mailer = require('../mailer');

const router = express.Router();

// ============================================================
// Validation Schemas
// ============================================================
const checkoutSchema = {
    body: z.object({
        student_id: z.string().min(1, 'กรุณาระบุรหัสนักศึกษา'),
        equipment_id: z.union([z.number(), z.string()]).transform(v => parseInt(v))
    })
};

const queueSchema = {
    body: z.object({
        student_id: z.string().min(1, 'กรุณาระบุรหัสนักศึกษา'),
        equipment_id: z.union([z.number(), z.string()]).transform(v => parseInt(v))
    })
};

const reportLostSchema = {
    body: z.object({
        id: z.union([z.number(), z.string()]).transform(v => parseInt(v)),
        student_id: z.string().min(1),
        lost_date: z.string().min(1, 'กรุณาระบุวันที่สูญหาย'),
        lost_note: z.string().optional()
    })
};

// ============================================================
// Public route — Login (no auth required)
// ============================================================
router.post('/login.php', async (req, res) => {
    // This is handled by authRoutes as /api/auth/user-login
    // Keep this for backward compatibility with mobile app
    const { studentId, citizenId } = req.body;
    if (!studentId || !citizenId) return res.status(400).json({ success: false, message: "Missing data" });
    try {
        const [rows] = await pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [studentId, citizenId]);
        if (rows.length > 0) {
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = process.env.JWT_SECRET || 'project-libraries-secret-key-2026';
            const token = jwt.sign(
                { id: studentId, role: 'student' },
                JWT_SECRET,
                { expiresIn: '8h' }
            );
            res.json({ success: true, message: "Login successful", token });
        }
        else res.json({ success: false, message: "Invalid credentials" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Public route — Get equipments (browsable without login)
// ============================================================
router.get('/get_equipments.php', async (req, res) => {
    try {
        const sql = `SELECT e.*, 
            (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity,
            (SELECT COUNT(*) FROM equipment_queue WHERE equipment_id = e.equipment_id AND status IN ('waiting', 'called')) AS queue_count
            FROM equipments e`;
        const [rows] = await pool.query(sql);
        rows.forEach(r => { if (r.available_quantity < 0) r.available_quantity = 0; });
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// ============================================================
// Public route — Get equipment detail
// ============================================================
router.get('/get_detail.php', async (req, res) => {
    const id = parseInt(req.query.id);
    try {
        const sql = `SELECT e.*, 
            (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity,
            (SELECT COUNT(*) FROM equipment_queue WHERE equipment_id = e.equipment_id AND status IN ('waiting', 'called')) AS queue_count
            FROM equipments e WHERE e.equipment_id = ?`;
        const [rows] = await pool.query(sql, [id]);
        if (rows[0] && rows[0].available_quantity < 0) rows[0].available_quantity = 0;
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// ============================================================
// Public route — Get queue for an equipment
// ============================================================
router.get('/get_queue.php', async (req, res) => {
    const equipmentId = parseInt(req.query.equipment_id);
    if (!equipmentId) return res.status(400).json({ success: false, message: "equipment_id is required" });
    try {
        const [rows] = await pool.query(
            `SELECT q.id, q.position, q.status, q.queued_at, q.called_at, q.expires_at,
                    s.name_th as student_name, q.student_id
             FROM equipment_queue q
             LEFT JOIN student_profiles s ON q.student_id = s.student_id
             WHERE q.equipment_id = ? AND q.status IN ('waiting', 'called')
             ORDER BY q.position ASC`,
            [equipmentId]
        );
        // Mask student names for privacy (show only first 2 chars)
        const maskedRows = rows.map(r => ({
            ...r,
            student_name: r.student_name ? r.student_name.substring(0, 4) + '***' : 'ผู้ใช้',
            student_id: r.student_id ? r.student_id.substring(0, 3) + '****' : ''
        }));
        res.json({ success: true, data: maskedRows, total: rows.length });
    } catch (error) {
        console.error("Get Queue Error:", error);
        res.status(500).json({ success: false, error: "Database Error" });
    }
});

// ============================================================
// Protected routes below — require authentication
// ============================================================
router.use('/get_student.php', authMiddleware);
router.use('/get_borrowed.php', authMiddleware);
router.use('/checkout.php', authMiddleware);
router.use('/cancel_request.php', authMiddleware);
router.use('/report_lost.php', authMiddleware);
router.use('/update_student_profile.php', authMiddleware);
router.use('/get_notifications.php', authMiddleware);
router.use('/join_queue.php', authMiddleware);
router.use('/my_queue.php', authMiddleware);
router.use('/cancel_queue.php', authMiddleware);

// ============================================================
// Get Student Profile
// ============================================================
router.get('/get_student.php', async (req, res) => {
    const id = req.query.id || req.user.id;
    try {
        const [rows] = await pool.query("SELECT * FROM student_profiles WHERE student_id = ?", [id]);
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ error: "Database Error" });
    }
});

// ============================================================
// Get Notifications
// ============================================================
router.get('/get_notifications.php', async (req, res) => {
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

// ============================================================
// Get Borrowed Items
// ============================================================
router.get('/get_borrowed.php', async (req, res) => {
    const student_id = req.query.student_id;
    if (!student_id) return res.status(400).json({ success: false, message: "student_id is required" });
    try {
        const sql = "SELECT b.id, b.student_id, b.equipment_id, b.borrow_date, b.return_date, b.lost_date, b.lost_note, b.pickup_time, b.reservation_expires_at, b.fine_amount, b.status, e.name, e.equipment_img, e.price, e.borrow_days FROM borrowed b LEFT JOIN equipments e ON b.equipment_id = e.equipment_id WHERE b.student_id = ? ORDER BY b.borrow_date DESC";
        const [rows] = await pool.query(sql, [student_id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Checkout — ยืมอุปกรณ์ (เฉพาะที่ยังมีเหลือ)
// ============================================================
router.post('/checkout.php', validate(checkoutSchema), async (req, res) => {
    const { student_id, equipment_id } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check for existing active borrow/pending
        const [check] = await connection.query(
            "SELECT id FROM borrowed WHERE student_id = ? AND equipment_id = ? AND status IN ('borrowed', 'pending')",
            [student_id, equipment_id]
        );
        if (check.length > 0) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "นักศึกษา 1 คน ยืม/จองอุปกรณ์ชิ้นนี้ได้สูงสุด 1 ชิ้น" });
        }

        // Check if student is already in queue for this equipment
        const [queueCheck] = await connection.query(
            "SELECT id FROM equipment_queue WHERE student_id = ? AND equipment_id = ? AND status IN ('waiting', 'called')",
            [student_id, equipment_id]
        );
        if (queueCheck.length > 0) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "คุณอยู่ในคิวของอุปกรณ์ชิ้นนี้แล้ว" });
        }

        // Limit to 5 items per day
        const [dailyCount] = await connection.query(
            "SELECT COUNT(id) as total FROM borrowed WHERE student_id = ? AND DATE(borrow_date) = CURDATE() AND status != 'rejected'",
            [student_id]
        );
        if (dailyCount[0].total >= 5) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "ระบบจำกัดการยืมอุปกรณ์สูงสุด 5 ชิ้นต่อวัน" });
        }

        // Check stock — only count truly available items
        const [stockCheck] = await connection.query(
            `SELECT COUNT(*) as available FROM equipment_items WHERE equipment_id = ? AND status = 'available'`,
            [equipment_id]
        );
        if (stockCheck[0].available <= 0) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "อุปกรณ์ชิ้นนี้ไม่มีให้ยืมในขณะนี้ กรุณาจองคิวแทน" });
        }

        await connection.query(
            "INSERT INTO borrowed (student_id, equipment_id, borrow_date, status, reservation_expires_at) VALUES (?, ?, NOW(), 'pending', DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
            [student_id, equipment_id]
        );

        await connection.commit();
        connection.release();

        req.app.get('io').emit('data_updated');
        
        // Notify user via Email and In-App
        const notifTitle = "ส่งคำขอยืมสำเร็จ";
        const notifMsg = `ระบบได้รับคำขอยืมอุปกรณ์แล้ว กรุณารอการอนุมัติจากเจ้าหน้าที่`;
        const [studentProfile] = await pool.query("SELECT email FROM student_profiles WHERE student_id = ?", [student_id]);
        if (studentProfile.length > 0 && studentProfile[0].email) {
            await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [studentProfile[0].email, notifTitle, notifMsg]);
            mailer.sendManualNotification(studentProfile[0].email, notifTitle, notifMsg);
        }

        res.json({ success: true, message: "ส่งคำขอยืมอุปกรณ์สำเร็จ กรุณารอการอนุมัติจากเจ้าหน้าที่" });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Checkout Error:", error);
        res.status(500).json({ success: false, message: "ไม่สามารถทำรายการได้" });
    }
});

// ============================================================
// Join Queue — จองคิวอุปกรณ์ (เฉพาะที่หมดแล้ว)
// ============================================================
router.post('/join_queue.php', validate(queueSchema), async (req, res) => {
    const { student_id, equipment_id } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Check if student already has this equipment borrowed
        const [borrowCheck] = await connection.query(
            "SELECT id FROM borrowed WHERE student_id = ? AND equipment_id = ? AND status IN ('borrowed', 'pending')",
            [student_id, equipment_id]
        );
        if (borrowCheck.length > 0) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "คุณกำลังยืมอุปกรณ์ชิ้นนี้อยู่แล้ว" });
        }

        // Check if student is already in queue
        const [queueCheck] = await connection.query(
            "SELECT id FROM equipment_queue WHERE student_id = ? AND equipment_id = ? AND status IN ('waiting', 'called')",
            [student_id, equipment_id]
        );
        if (queueCheck.length > 0) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "คุณอยู่ในคิวของอุปกรณ์ชิ้นนี้แล้ว" });
        }

        // Count current queue size (max 10)
        const [queueCount] = await connection.query(
            "SELECT COUNT(*) as total FROM equipment_queue WHERE equipment_id = ? AND status IN ('waiting', 'called')",
            [equipment_id]
        );
        if (queueCount[0].total >= 10) {
            await connection.rollback();
            connection.release();
            return res.json({ success: false, message: "คิวเต็มแล้ว (สูงสุด 10 คน) กรุณาลองใหม่ภายหลัง" });
        }

        // Get next position number
        const [maxPos] = await connection.query(
            "SELECT COALESCE(MAX(position), 0) as max_pos FROM equipment_queue WHERE equipment_id = ? AND status IN ('waiting', 'called')",
            [equipment_id]
        );
        const nextPosition = maxPos[0].max_pos + 1;

        await connection.query(
            "INSERT INTO equipment_queue (equipment_id, student_id, position, status, queued_at) VALUES (?, ?, ?, 'waiting', NOW())",
            [equipment_id, student_id, nextPosition]
        );

        await connection.commit();
        connection.release();

        req.app.get('io').emit('data_updated');

        // Get equipment name for notification
        const [equipInfo] = await pool.query("SELECT name FROM equipments WHERE equipment_id = ?", [equipment_id]);
        const equipName = equipInfo.length > 0 ? equipInfo[0].name : 'อุปกรณ์';

        // Notify user
        const notifTitle = "จองคิวสำเร็จ";
        const notifMsg = `คุณอยู่ในคิวลำดับที่ ${nextPosition} สำหรับอุปกรณ์ "${equipName}" ระบบจะแจ้งเตือนเมื่อถึงคิวของคุณ (มีเวลา 5 นาทีในการมารับ)`;
        const [studentProfile] = await pool.query("SELECT email FROM student_profiles WHERE student_id = ?", [student_id]);
        if (studentProfile.length > 0 && studentProfile[0].email) {
            await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [studentProfile[0].email, notifTitle, notifMsg]);
            mailer.sendManualNotification(studentProfile[0].email, notifTitle, notifMsg);
        }

        res.json({ success: true, message: `จองคิวสำเร็จ ลำดับที่ ${nextPosition}`, position: nextPosition });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Join Queue Error:", error);
        res.status(500).json({ success: false, message: "ไม่สามารถจองคิวได้" });
    }
});

// ============================================================
// My Queue — ดูรายการคิวของตัวเอง
// ============================================================
router.get('/my_queue.php', async (req, res) => {
    const student_id = req.query.student_id;
    if (!student_id) return res.status(400).json({ success: false, message: "student_id is required" });
    try {
        const sql = `SELECT q.*, e.name as equipment_name, e.equipment_img, e.price
                     FROM equipment_queue q
                     LEFT JOIN equipments e ON q.equipment_id = e.equipment_id
                     WHERE q.student_id = ? AND q.status IN ('waiting', 'called')
                     ORDER BY q.queued_at ASC`;
        const [rows] = await pool.query(sql, [student_id]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("My Queue Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Cancel Queue — ยกเลิกคิวตัวเอง
// ============================================================
router.post('/cancel_queue.php', async (req, res) => {
    const { id, student_id } = req.body;
    if (!id || !student_id) return res.status(400).json({ success: false, message: "Missing id or student_id" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [queueItem] = await connection.query(
            "SELECT * FROM equipment_queue WHERE id = ? AND student_id = ? AND status IN ('waiting', 'called')",
            [parseInt(id), student_id]
        );
        if (queueItem.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "ไม่พบรายการคิวนี้" });
        }

        await connection.query("UPDATE equipment_queue SET status = 'cancelled' WHERE id = ?", [parseInt(id)]);

        // Re-order positions for remaining queue items
        const [remaining] = await connection.query(
            "SELECT id FROM equipment_queue WHERE equipment_id = ? AND status IN ('waiting', 'called') ORDER BY position ASC",
            [queueItem[0].equipment_id]
        );
        for (let i = 0; i < remaining.length; i++) {
            await connection.query("UPDATE equipment_queue SET position = ? WHERE id = ?", [i + 1, remaining[i].id]);
        }

        await connection.commit();
        connection.release();

        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "ยกเลิกคิวเรียบร้อยแล้ว" });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error("Cancel Queue Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Cancel Request — with Database Transaction
// ============================================================
router.post('/cancel_request.php', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Missing id" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [borrowed] = await connection.query("SELECT equipment_id, status FROM borrowed WHERE id = ?", [parseInt(id)]);
        if (borrowed.length > 0) {
            if (borrowed[0].status === 'borrowed') {
                const equip_id = borrowed[0].equipment_id;
                const [item] = await connection.query(
                    "SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'borrowed' LIMIT 1 FOR UPDATE",
                    [equip_id]
                );
                if (item.length > 0) {
                    await connection.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [item[0].item_id]);
                }
            }
            await connection.query("UPDATE borrowed SET status = 'rejected' WHERE id = ?", [parseInt(id)]);

            await connection.commit();
            connection.release();

            const [studentProfile] = await pool.query(
                "SELECT s.email, e.name as equipment_name FROM student_profiles s JOIN borrowed b ON s.student_id = b.student_id LEFT JOIN equipments e ON b.equipment_id = e.equipment_id WHERE b.id = ?",
                [parseInt(id)]
            );
            
            if (studentProfile.length > 0 && studentProfile[0].email) {
                const notifTitle = "ยกเลิกคำขอยืมสำเร็จ";
                const notifMsg = `คุณได้ยกเลิกคำขอยืมอุปกรณ์ "${studentProfile[0].equipment_name}" เรียบร้อยแล้ว`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [studentProfile[0].email, notifTitle, notifMsg]);
                mailer.sendManualNotification(studentProfile[0].email, notifTitle, notifMsg);
            }

            req.app.get('io').emit('data_updated');
            res.json({ success: true, message: "ยกเลิกรายการเรียบร้อยแล้ว" });
        } else {
            await connection.rollback();
            connection.release();
            res.status(404).json({ success: false, message: "Request not found" });
        }
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Report Lost
// ============================================================
router.post('/report_lost.php', validate(reportLostSchema), async (req, res) => {
    const { id, student_id, lost_date, lost_note } = req.body;

    try {
        const [borrowed] = await pool.query(
            "SELECT b.*, e.name as equipment_name, s.name_th as student_name, s.email as student_email FROM borrowed b LEFT JOIN equipments e ON b.equipment_id = e.equipment_id LEFT JOIN student_profiles s ON b.student_id = s.student_id WHERE b.id = ? AND b.student_id = ?",
            [id, student_id]
        );
        if (borrowed.length === 0) {
            return res.status(404).json({ success: false, message: "ไม่พบรายการยืมอุปกรณ์นี้" });
        }

        const item = borrowed[0];
        if (item.status !== 'borrowed' && item.status !== 'overdue') {
            return res.status(400).json({ success: false, message: "สามารถแจ้งสูญหายได้เฉพาะอุปกรณ์ที่กำลังยืมอยู่เท่านั้น" });
        }

        const [equipItem] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'borrowed' LIMIT 1", [item.equipment_id]);
        if (equipItem.length > 0) {
            await pool.query("UPDATE equipment_items SET status = 'damaged_lost' WHERE item_id = ?", [equipItem[0].item_id]);
        }

        const formattedLostDate = new Date(lost_date).toISOString().slice(0, 19).replace('T', ' ');

        await pool.query(
            "UPDATE borrowed SET status = 'damaged_lost', lost_date = ?, lost_note = ?, return_date = NOW() WHERE id = ?",
            [formattedLostDate, lost_note || null, id]
        );

        const notifTitle = "แจ้งเตือนอุปกรณ์สูญหาย/ชำรุด";
        const notifMsg = `คุณได้แจ้งอุปกรณ์ "${item.equipment_name}" สูญหาย/ชำรุด (วันที่หาย: ${lost_date}) กรุณาติดต่อบรรณารักษ์`;
        if (item.student_email) {
            await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [item.student_email, notifTitle, notifMsg]);
            mailer.sendManualNotification(item.student_email, notifTitle, notifMsg);
        }

        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "แจ้งสูญหายเรียบร้อยแล้ว" });
    } catch (error) {
        console.error("Report Lost Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Update Student Profile
// ============================================================
router.post('/update_student_profile.php', async (req, res) => {
    const { student_id, name_th, name_en, email, phone_number, department, student_img, current_password, new_password, notify_email } = req.body;
    if (!student_id) return res.status(400).json({ success: false, message: "Missing student_id" });

    try {
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ success: false, message: "กรุณาระบุรหัสผ่านปัจจุบันเพื่อเปลี่ยนรหัสผ่าน" });
            }
            const [userCheck] = await pool.query("SELECT * FROM users WHERE username = ? AND password = ?", [student_id, current_password]);
            if (userCheck.length === 0) {
                return res.status(400).json({ success: false, message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
            }
            await pool.query("UPDATE users SET password = ? WHERE username = ?", [new_password, student_id]);
        }

        await pool.query(
            `UPDATE student_profiles 
             SET name_th = COALESCE(?, name_th),
                 name_en = COALESCE(?, name_en),
                 email = COALESCE(?, email),
                 phone_number = COALESCE(?, phone_number),
                 department = COALESCE(?, department),
                 student_img = COALESCE(?, student_img),
                 notify_email = COALESCE(?, notify_email)
             WHERE student_id = ?`,
            [name_th || null, name_en || null, email || null, phone_number || null, department || null, student_img || null, notify_email !== undefined ? notify_email : null, student_id]
        );

        const [updatedRows] = await pool.query("SELECT * FROM student_profiles WHERE student_id = ?", [student_id]);
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "บันทึกการตั้งค่าเรียบร้อยแล้ว", data: updatedRows[0] || {} });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

module.exports = router;
