const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const generateChartData = require('../generate_chart_data');
const mailer = require('../mailer');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// ============================================================
// Multer Configuration for Image Uploads
// ============================================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/equipments/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'eq-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ============================================================
// Public Route: Get Equipment Items Status (for QR list realtime)
// ============================================================
router.get('/equipment_items/status', async (req, res) => {
    try {
        const [items] = await pool.query("SELECT full_asset_code, status FROM equipment_items");
        res.json({ success: true, data: items });
    } catch (error) {
        console.error("Equipment Items Status Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// All other admin routes require authentication
// ============================================================
router.use(authMiddleware);

// ============================================================
// Helper: Call next person in queue for an equipment
// ============================================================
async function callNextInQueue(equipmentId, io) {
    try {
        // Find the next waiting person in queue
        const [nextInQueue] = await pool.query(
            `SELECT q.*, s.email as student_email, s.name_th as student_name, e.name as equipment_name
             FROM equipment_queue q
             LEFT JOIN student_profiles s ON q.student_id = s.student_id
             LEFT JOIN equipments e ON q.equipment_id = e.equipment_id
             WHERE q.equipment_id = ? AND q.status = 'waiting'
             ORDER BY q.position ASC LIMIT 1`,
            [equipmentId]
        );

        if (nextInQueue.length === 0) {
            console.log(`[Queue] No one waiting in queue for equipment #${equipmentId}`);
            return null;
        }

        const queueItem = nextInQueue[0];
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
        const pad = (n) => n.toString().padStart(2, '0');
        const formatLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        await pool.query(
            "UPDATE equipment_queue SET status = 'called', called_at = NOW(), expires_at = ? WHERE id = ?",
            [formatLocal(expiresAt), queueItem.id]
        );

        // Send notification
        const notifTitle = "ถึงคิวของคุณแล้ว!";
        const notifMsg = `อุปกรณ์ \"${queueItem.equipment_name}\" พร้อมให้ยืมแล้ว กรุณามารับอุปกรณ์ภายใน 5 นาที มิฉะนั้นคิวจะถูกข้ามไปยังคนถัดไปอัตโนมัติ`;
        if (queueItem.student_email) {
            await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", 
                [queueItem.student_email, notifTitle, notifMsg]);
            mailer.sendManualNotification(queueItem.student_email, notifTitle, notifMsg);
        }

        if (io) io.emit('data_updated');
        console.log(`[Queue] Called queue #${queueItem.id} (student: ${queueItem.student_id}) for equipment #${equipmentId}`);
        return queueItem;
    } catch (error) {
        console.error('[Queue] Error calling next in queue:', error);
        return null;
    }
}

// Export for use in server.js cron
router.callNextInQueue = callNextInQueue;

// ============================================================
// Validation Schemas
// ============================================================
const updateRequestSchema = {
    body: z.object({
        id: z.union([z.number(), z.string()]).transform(v => parseInt(v)),
        action: z.enum(['approve', 'reject', 'return', 'lost', 'fine_paid']),
        fine: z.union([z.number(), z.string()]).optional().transform(v => v ? parseFloat(v) : 0)
    })
};

const addEquipmentSchema = {
    body: z.object({
        name: z.string().min(1, 'กรุณาระบุชื่ออุปกรณ์'),
        kit_code: z.string().min(1, 'กรุณาระบุรหัสอุปกรณ์'),
        category: z.string().optional().default('อุปกรณ์อิเล็กทรอนิกส์'),
        total_quantity: z.union([z.number(), z.string()]).transform(v => parseInt(v)),
        available_quantity: z.union([z.number(), z.string()]).transform(v => parseInt(v)),
        borrow_days: z.union([z.number(), z.string()]).transform(v => parseInt(v)),
        price: z.union([z.number(), z.string()]).transform(v => parseFloat(v)),
        description: z.string().optional().default(''),
        status: z.string().optional().default('ใช้งานได้')
    })
};

const notificationSchema = {
    body: z.object({
        target: z.string().min(1),
        title: z.string().min(1, 'กรุณาระบุหัวข้อ'),
        message: z.string().min(1, 'กรุณาระบุข้อความ')
    })
};

// ============================================================
// 1. Dashboard
// ============================================================
router.get('/dashboard', async (req, res) => {
    try {
        const response = {
            kpi: { today: 0, returned: 0, overdue: 0, pending: 0 },
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

        // Fines removed

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

// ============================================================
// 2. Get Requests (with Pagination)
// ============================================================
router.get('/requests', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;
        const statusFilter = req.query.status;

        let whereClause = '';
        const queryParams = [];

        if (statusFilter && statusFilter !== 'all') {
            whereClause = 'WHERE b.status = ?';
            queryParams.push(statusFilter);
        }

        // Count total
        const [countRes] = await pool.query(
            `SELECT COUNT(*) as total FROM borrowed b ${whereClause}`,
            queryParams
        );
        const total = countRes[0].total;

        const sql = `
            SELECT 
                b.id, b.student_id, e.name as equipment_name, e.equipment_id, e.price, e.borrow_days,
                b.borrow_date, b.return_date, b.lost_date, b.lost_note, b.status, b.fine_amount, sp.* 
            FROM borrowed b
            LEFT JOIN student_profiles sp ON b.student_id = sp.student_id
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            ${whereClause}
            ORDER BY b.borrow_date DESC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await pool.query(sql, [...queryParams, limit, offset]);

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
                dueDate.setHours(0,0,0,0);
                const now = new Date();
                now.setHours(0,0,0,0);
                if (now > dueDate) {
                    const diffTime = Math.abs(now - dueDate);
                    overdue_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    calculated_fine = 0;
                }
            } else if (row.status === 'returned' || row.status === 'damaged_lost') {
                calculated_fine = 0;
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
                lost_date: row.lost_date,
                lost_note: row.lost_note,
                status: row.status,
                fine_amount: calculated_fine,
                overdue_days: overdue_days
            };
        });

        res.json({
            success: true,
            data: requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 3. Update Request Status (with Database Transaction)
// ============================================================
router.post('/update-request', validate(updateRequestSchema), async (req, res) => {
    const { id, action, fine } = req.body;

    let new_status = "";
    if (action === 'approve') new_status = "borrowed";
    else if (action === 'reject') new_status = "rejected";
    else if (action === 'return') new_status = "returned";
    else if (action === 'lost') new_status = "damaged_lost";
    else return res.status(400).json({ success: false, message: "Invalid action" });

    // Use database transaction for data integrity
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Fetch detailed borrow info for email
        const [borrowInfoRes] = await connection.query(`
            SELECT b.status, b.equipment_id, e.name as equipment_name, 
                   s.email as student_email, s.name_th as student_name 
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.id = ?
        `, [id]);
        const borrowInfo = borrowInfoRes.length > 0 ? borrowInfoRes[0] : null;

        if (!borrowInfo) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "ไม่พบรายการยืมนี้" });
        }

        if (action === 'approve') {
            const equip_id = borrowInfo.equipment_id;
            const [item] = await connection.query(
                "SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT 1 FOR UPDATE",
                [equip_id]
            );
            if (item.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ success: false, message: "อุปกรณ์หมด ไม่สามารถอนุมัติได้" });
            }
            await connection.query("UPDATE equipment_items SET status = 'borrowed' WHERE item_id = ?", [item[0].item_id]);
        }

        if (action === 'return' || action === 'lost' || (action === 'reject' && borrowInfo.status === 'borrowed')) {
            // If it was already returned/rejected, don't free another item
            if (borrowInfo.status !== 'returned' && borrowInfo.status !== 'rejected' && borrowInfo.status !== 'damaged_lost') {
                const equip_id = borrowInfo.equipment_id;
                const [item] = await connection.query(
                    "SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'borrowed' LIMIT 1 FOR UPDATE",
                    [equip_id]
                );
                if (item.length > 0) {
                    if (action === 'lost') {
                        await connection.query("UPDATE equipment_items SET status = 'damaged_lost' WHERE item_id = ?", [item[0].item_id]);
                    } else {
                        await connection.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [item[0].item_id]);
                    }
                }
            }
        }
        
        if (action === 'return') {
            await connection.query("UPDATE borrowed SET status = ?, return_date = NOW() WHERE id = ?", [new_status, id]);
        } else if (action === 'lost') {
            await connection.query("UPDATE borrowed SET status = ?, return_date = NOW() WHERE id = ?", [new_status, id]);
        } else {
            await connection.query("UPDATE borrowed SET status = ? WHERE id = ?", [new_status, id]);
        }

        await connection.commit();
        connection.release();

        // Auto-call next in queue when equipment becomes available
        if (action === 'return') {
            setImmediate(async () => {
                try {
                    await callNextInQueue(borrowInfo.equipment_id, req.app.get('io'));
                } catch (e) {
                    console.error('[Queue] Error auto-calling next:', e);
                }
            });
        }

        // Send emails AFTER successful transaction (non-blocking)
        setImmediate(async () => {
            try {
                if (action === 'return') {
                    if (borrowInfo.student_email) {
                        mailer.sendReturnEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                    }
                } else if (action === 'lost') {
                    if (borrowInfo.student_email) {
                        const notifTitle = "แจ้งเตือนอุปกรณ์ชำรุด/สูญหาย";
                        const notifMsg = `อุปกรณ์ "${borrowInfo.equipment_name}" ถูกบันทึกว่าสูญหาย/ชำรุด กรุณาติดต่อบรรณารักษ์`;
                        await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
                    }
                } else if (action === 'approve') {
                    if (borrowInfo.student_email) {
                        mailer.sendApprovalEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                    }
                } else if (action === 'reject') {
                    if (borrowInfo.student_email) {
                        const notifTitle = "คำขอยืมถูกยกเลิก";
                        const notifMsg = `คำขอยืมอุปกรณ์ "${borrowInfo.equipment_name}" ของคุณถูกยกเลิกโดยผู้ดูแลระบบ`;
                        await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
                        mailer.sendManualNotification(borrowInfo.student_email, notifTitle, notifMsg);
                    }
                }
            } catch (emailError) {
                console.error('[Email] Error sending post-action email:', emailError);
            }
        });

        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: `Status updated to ${new_status}` });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 4. Notifications — POST (send)
// ============================================================
router.post('/notifications', upload.single('notification_img'), validate(notificationSchema), async (req, res) => {
    const { target, title, message } = req.body;
    const image_url = req.file ? 'uploads/equipments/' + req.file.filename : null; // Using existing uploads folder

    try {
        let emails = [];
        if (target === 'all') {
            const [users] = await pool.query("SELECT email FROM student_profiles WHERE email IS NOT NULL AND email != ''");
            emails = users.map(u => u.email);
        } else {
            emails.push(target);
        }

        // Save notification to database for UI display
        await pool.query("INSERT INTO notifications (target, title, message, type, image_url) VALUES (?, ?, ?, 'announcement', ?)", [target, title, message, image_url]);
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

// ============================================================
// 5. Notifications — GET
// ============================================================
router.get('/notifications', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM notifications ORDER BY created_at DESC");
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 6. Get Equipments
// ============================================================
router.get('/equipments', async (req, res) => {
    try {
        const sql = `SELECT e.*, 
            (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity,
            (SELECT COUNT(*) FROM equipment_queue WHERE equipment_id = e.equipment_id AND status IN ('waiting', 'called')) AS queue_count
            FROM equipments e ORDER BY e.equipment_id DESC`;
        const [rows] = await pool.query(sql);
        rows.forEach(r => { if (r.available_quantity < 0) r.available_quantity = 0; });
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 7. Add Equipment
// ============================================================
const autoCategory = (name) => {
    const n = name.toLowerCase();
    if (n.includes('หูฟัง') || n.includes('headphone')) return 'หูฟัง';
    if (n.includes('ipad') || n.includes('ไอแพด')) return 'iPad';
    if (n.includes('ปลั๊ก')) return 'ปลั๊กไฟพ่วง';
    if (n.includes('ปากกาแท็บเล็ต') || n.includes('stylus') || n.includes('pencil')) return 'ปากกาแท็บเล็ต';
    if (n.includes('เมาส์') || n.includes('mouse')) return 'เมาส์';
    if (n.includes('สายเชื่อมต่อ') || n.includes('adapter') || n.includes('cable') || n.includes('dongle')) return 'สายเชื่อมต่อ';
    if (n.includes('cyberdict') || n.includes('ดิกชันนารี')) return 'CyberDict';
    if (n.includes('เครื่องคิดเลข') || n.includes('calculator')) return 'เครื่องคิดเลข';
    if (n.includes('สายชาร์จ') || n.includes('charger') || n.includes('lightning') || n.includes('type-c')) return 'สายชาร์จโทรศัพท์';
    if (n.includes('โคมไฟ') || n.includes('lamp')) return 'โคมไฟ';
    if (n.includes('ปากกาแปลคำศัพท์') || n.includes('scan') || n.includes('แปล')) return 'ปากกาแปลคำศัพท์';
    return 'อุปกรณ์ทั่วไป';
};
router.post('/equipments', upload.single('equipment_img'), validate(addEquipmentSchema), async (req, res) => {
    const { name, kit_code, total_quantity, available_quantity, borrow_days, price, description, status: equipStatus } = req.body;
    const category = autoCategory(name);
    const equipment_img = req.file ? 'uploads/equipments/' + req.file.filename : null;
    try {
        const sql = `INSERT INTO equipments (kit_code, name, total_quantity, description, usage_type, price, category, borrow_days, status, equipment_img) 
                     VALUES (?, ?, ?, ?, 'internal', ?, ?, ?, ?, ?)`;
        const [result] = await pool.query(sql, [
            kit_code, name, total_quantity, description, price, category, borrow_days, equipStatus, equipment_img
        ]);
        const equipment_id = result.insertId;

        for(let i=0; i < total_quantity; i++) {
            const status = (i < available_quantity) ? 'available' : 'borrowed';
            const seq = `c.${i+1}`;
            const asset = `${Date.now()}-${i}`;
            await pool.query(`INSERT INTO equipment_items (equipment_id, sequence_code, full_asset_code, status) VALUES (?, ?, ?, ?)`, [equipment_id, seq, asset, status]);
        }
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "เพิ่มอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 8. Update Equipment
// ============================================================
router.put('/equipments/:id', upload.single('equipment_img'), async (req, res) => {
    const { id } = req.params;
    const { name, kit_code, total_quantity, available_quantity, borrow_days, price, description, status: equipStatus } = req.body;
    const category = autoCategory(name);
    const equipment_img = req.file ? 'uploads/equipments/' + req.file.filename : null;
    try {
        if (equipment_img) {
            const sql = `UPDATE equipments SET kit_code=?, name=?, total_quantity=?, description=?, price=?, category=?, borrow_days=?, status=?, equipment_img=? WHERE equipment_id=?`;
            await pool.query(sql, [
                kit_code, name, parseInt(total_quantity), description, parseFloat(price), category, parseInt(borrow_days), equipStatus || 'ใช้งานได้', equipment_img, parseInt(id)
            ]);
        } else {
            const sql = `UPDATE equipments SET kit_code=?, name=?, total_quantity=?, description=?, price=?, category=?, borrow_days=?, status=? WHERE equipment_id=?`;
            await pool.query(sql, [
                kit_code, name, parseInt(total_quantity), description, parseFloat(price), category, parseInt(borrow_days), equipStatus || 'ใช้งานได้', parseInt(id)
            ]);
        }
        
        // Count existing items
        const [existing] = await pool.query("SELECT item_id, status FROM equipment_items WHERE equipment_id = ?", [parseInt(id)]);
        const total = parseInt(total_quantity);
        const reqAvailable = parseInt(available_quantity);
        
        // Adjust total_quantity
        if (total > existing.length) {
            const diff = total - existing.length;
            for(let i=0; i < diff; i++) {
                const seq = `c.${existing.length + i + 1}`;
                const asset = `${Date.now()}-${i}`;
                await pool.query("INSERT INTO equipment_items (equipment_id, sequence_code, full_asset_code, status) VALUES (?, ?, ?, 'available')", [parseInt(id), seq, asset]);
            }
        } else if (total < existing.length) {
            const diff = existing.length - total;
            // Try to delete available items first
            await pool.query("DELETE FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT ?", [parseInt(id), diff]);
            const [afterDel] = await pool.query("SELECT item_id FROM equipment_items WHERE equipment_id = ?", [parseInt(id)]);
            if (afterDel.length > total) {
                await pool.query("DELETE FROM equipment_items WHERE equipment_id = ? LIMIT ?", [parseInt(id), afterDel.length - total]);
            }
        }

        // Adjust available_quantity
        if (!isNaN(reqAvailable)) {
             const [currentItems] = await pool.query("SELECT item_id, status FROM equipment_items WHERE equipment_id = ?", [parseInt(id)]);
             const currentAvailable = currentItems.filter(item => item.status === 'available').length;
             
             if (reqAvailable > currentAvailable) {
                 const diff = reqAvailable - currentAvailable;
                 await pool.query("UPDATE equipment_items SET status = 'available' WHERE equipment_id = ? AND status != 'borrowed' AND status != 'available' LIMIT ?", [parseInt(id), diff]);
             } else if (reqAvailable < currentAvailable) {
                 const diff = currentAvailable - reqAvailable;
                 await pool.query("UPDATE equipment_items SET status = 'damaged_lost' WHERE equipment_id = ? AND status = 'available' LIMIT ?", [parseInt(id), diff]);
             }
        }
        
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "แก้ไขอุปกรณ์สำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 9. Delete Equipment (single route — removed duplicate)
// ============================================================
router.delete('/equipments/:id', async (req, res) => {
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

// ============================================================
// 10. Get Users
// ============================================================
router.get('/users', async (req, res) => {
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
            AND EXISTS (
                SELECT 1 FROM borrowed b WHERE b.student_id = sp.student_id
            )
            ORDER BY u.created_at DESC
        `;
        const [rows] = await pool.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 11. Get User History
// ============================================================
router.get('/user-history/:studentId', async (req, res) => {
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

// ============================================================
// 12. Queue Management — Get queue for equipment
// ============================================================
router.get('/queue/:equipmentId', async (req, res) => {
    const { equipmentId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT q.*, s.name_th as student_name, s.student_img, s.email as student_email,
                    e.name as equipment_name
             FROM equipment_queue q
             LEFT JOIN student_profiles s ON q.student_id = s.student_id
             LEFT JOIN equipments e ON q.equipment_id = e.equipment_id
             WHERE q.equipment_id = ? AND q.status IN ('waiting', 'called')
             ORDER BY q.position ASC`,
            [parseInt(equipmentId)]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 13. Queue Management — Skip queue (call next person)
// ============================================================
router.post('/queue/:id/skip', async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [queueItem] = await connection.query(
            "SELECT * FROM equipment_queue WHERE id = ? AND status IN ('waiting', 'called')",
            [parseInt(id)]
        );
        if (queueItem.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "ไม่พบรายการคิวนี้" });
        }

        // Mark current as expired
        await connection.query("UPDATE equipment_queue SET status = 'expired' WHERE id = ?", [parseInt(id)]);

        // Re-order remaining positions
        const [remaining] = await connection.query(
            "SELECT id FROM equipment_queue WHERE equipment_id = ? AND status IN ('waiting', 'called') ORDER BY position ASC",
            [queueItem[0].equipment_id]
        );
        for (let i = 0; i < remaining.length; i++) {
            await connection.query("UPDATE equipment_queue SET position = ? WHERE id = ?", [i + 1, remaining[i].id]);
        }

        await connection.commit();
        connection.release();

        // Notify skipped student
        const [studentInfo] = await pool.query(
            "SELECT s.email, e.name as equipment_name FROM student_profiles s, equipments e WHERE s.student_id = ? AND e.equipment_id = ?",
            [queueItem[0].student_id, queueItem[0].equipment_id]
        );
        if (studentInfo.length > 0 && studentInfo[0].email) {
            const notifTitle = "คิวของคุณถูกข้าม";
            const notifMsg = `คิวสำหรับอุปกรณ์ \"${studentInfo[0].equipment_name}\" ของคุณถูกข้ามเนื่องจากไม่มารับภายในเวลาที่กำหนด`;
            await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [studentInfo[0].email, notifTitle, notifMsg]);
            mailer.sendManualNotification(studentInfo[0].email, notifTitle, notifMsg);
        }

        // Auto-call next in queue
        await callNextInQueue(queueItem[0].equipment_id, req.app.get('io'));

        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "ข้ามคิวเรียบร้อย เรียกคิวถัดไปแล้ว" });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 13.5 Queue Details (Fetch pending items in a queue)
// ============================================================
router.get('/queue_details.php', async (req, res) => {
    const { queue_id } = req.query;
    if (!queue_id) return res.status(400).json({ success: false, message: "Missing queue_id" });

    try {
        const isBorrowRequest = typeof queue_id === 'string' && queue_id.toUpperCase().startsWith('LB');
        if (isBorrowRequest) {
            const borrowId = parseInt(queue_id.toUpperCase().replace('LB', ''), 10);
            if (isNaN(borrowId)) return res.status(400).json({ success: false, message: "Invalid queue id" });

            const [borrowItem] = await pool.query("SELECT * FROM borrowed WHERE id = ?", [borrowId]);
            if (borrowItem.length === 0) return res.status(404).json({ success: false, message: "Queue not found" });

            const bReq = borrowItem[0];
            
            // Get all items in the group
            // Use reservation_expires_at as group key (most reliable)
            let groupItems;
            if (bReq.reservation_expires_at) {
                [groupItems] = await pool.query(
                    `SELECT b.id as borrow_id, b.status as borrow_status, e.name as equipment_name, e.category 
                     FROM borrowed b
                     JOIN equipments e ON b.equipment_id = e.equipment_id
                     WHERE b.student_id = ? AND b.status IN ('pending', 'borrowed') 
                     AND b.reservation_expires_at = ?
                     ORDER BY b.id ASC`,
                    [bReq.student_id, bReq.reservation_expires_at]
                );
            } else {
                [groupItems] = await pool.query(
                    `SELECT b.id as borrow_id, b.status as borrow_status, e.name as equipment_name, e.category 
                     FROM borrowed b
                     JOIN equipments e ON b.equipment_id = e.equipment_id
                     WHERE b.student_id = ? AND b.status IN ('pending', 'borrowed') 
                     AND b.borrow_date >= DATE_SUB(?, INTERVAL 5 MINUTE)
                     AND b.borrow_date <= DATE_ADD(?, INTERVAL 5 MINUTE)
                     ORDER BY b.id ASC`,
                    [bReq.student_id, bReq.borrow_date, bReq.borrow_date]
                );
            }

            const dateStr = new Date(bReq.borrow_date).toLocaleString('th-TH', { 
                day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' 
            });

            return res.json({
                success: true,
                data: {
                    queue_id: queue_id,
                    borrow_date_str: dateStr,
                    total_items: groupItems.length,
                    items: groupItems.map(item => ({
                        id: item.borrow_id,
                        name: item.equipment_name,
                        category: item.category || 'อุปกรณ์ทั่วไป',
                        status: item.borrow_status
                    }))
                }
            });
        } else {
            // It's a single queue item
            const parsedQueueId = parseInt(queue_id, 10);
            const [queueItem] = await pool.query(
                `SELECT q.id as queue_id, q.status as q_status, e.name as equipment_name, e.category, q.queue_date
                 FROM equipment_queue q
                 JOIN equipments e ON q.equipment_id = e.equipment_id
                 WHERE q.id = ?`,
                [parsedQueueId]
            );
            if (queueItem.length === 0) return res.status(404).json({ success: false, message: "Queue not found" });

            const qReq = queueItem[0];
            const dateStr = new Date(qReq.queue_date).toLocaleString('th-TH', { 
                day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' 
            });

            return res.json({
                success: true,
                data: {
                    queue_id: queue_id,
                    borrow_date_str: dateStr,
                    total_items: 1,
                    items: [{
                        id: qReq.queue_id,
                        name: qReq.equipment_name,
                        category: qReq.category || 'อุปกรณ์ทั่วไป',
                        status: qReq.q_status === 'completed' ? 'borrowed' : 'pending'
                    }]
                }
            });
        }
    } catch (error) {
        console.error("Queue Details Error:", error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 14. Queue Pickup — Process QR scan and assign physical item
// ============================================================
router.post('/pickup_queue.php', async (req, res) => {
    const { queue_id, barcode } = req.body;
    
    if (!queue_id || !barcode) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรหัสคิวและบาร์โค้ดอุปกรณ์" });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const isBorrowRequest = typeof queue_id === 'string' && queue_id.toUpperCase().startsWith('LB');

        if (isBorrowRequest) {
            // --- HANDLE BORROW REQUEST (GROUP) ---
            const borrowId = parseInt(queue_id.toUpperCase().replace('LB', ''), 10);
            if (isNaN(borrowId)) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ success: false, message: "รหัสรายการยืมไม่ถูกต้อง" });
            }

            const [borrowItem] = await connection.query(
                "SELECT * FROM borrowed WHERE id = ?",
                [borrowId]
            );

            if (borrowItem.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ success: false, message: "ไม่พบข้อมูลรายการยืมนี้" });
            }

            const bReq = borrowItem[0];

            if (barcode === 'AUTO') {
                // Find all items in the same group
                // Use reservation_expires_at as group key (all items in a batch share the same value)
                let groupItems;
                if (bReq.reservation_expires_at) {
                    [groupItems] = await connection.query(
                        `SELECT * FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND reservation_expires_at = ?
                         FOR UPDATE`,
                        [bReq.student_id, bReq.reservation_expires_at]
                    );
                } else {
                    [groupItems] = await connection.query(
                        `SELECT * FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND borrow_date >= DATE_SUB(?, INTERVAL 5 MINUTE)
                         AND borrow_date <= DATE_ADD(?, INTERVAL 5 MINUTE)
                         FOR UPDATE`,
                        [bReq.student_id, bReq.borrow_date, bReq.borrow_date]
                    );
                }

                let processedCount = 0;
                let barcodesAssigned = [];

                for (const item of groupItems) {
                    const [autoItems] = await connection.query(
                        "SELECT * FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT 1 FOR UPDATE",
                        [item.equipment_id]
                    );

                    if (autoItems.length > 0) {
                        const pItem = autoItems[0];
                        await connection.query("UPDATE equipment_items SET status = 'borrowed' WHERE item_id = ?", [pItem.item_id]);
                        await connection.query("UPDATE borrowed SET status = 'borrowed', pickup_time = NOW() WHERE id = ?", [item.id]);
                        barcodesAssigned.push(pItem.full_asset_code);
                        processedCount++;
                    }
                }

                await connection.commit();
                connection.release();

                req.app.get('io').emit('data_updated');
                req.app.get('io').emit('scan_success', {
                    type: 'pickup',
                    message: `จ่ายอุปกรณ์สำเร็จ ${processedCount} รายการ`,
                    barcode: barcodesAssigned.join(', ')
                });

                if (processedCount === 0) {
                    return res.status(404).json({ success: false, message: "ไม่มีอุปกรณ์รุ่นใดว่างในสต๊อกเลย" });
                }

                return res.json({ success: true, message: `จ่ายอุปกรณ์สำเร็จ ${processedCount} รายการ` });
            } else {
                // Manual barcode scan for a specific item in the queue group
                const [physicalItem] = await connection.query(
                    "SELECT * FROM equipment_items WHERE full_asset_code = ? AND status = 'available' FOR UPDATE",
                    [barcode]
                );
                if (physicalItem.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ success: false, message: "ไม่พบอุปกรณ์บาร์โค้ดนี้ หรือไม่พร้อมใช้งาน" });
                }
                
                const pItem = physicalItem[0];
                
                // Find one pending request for this student + equipment type
                // Use reservation_expires_at as group key (all items in a batch share the same value)
                // Fallback: match by student_id + equipment_id if reservation_expires_at is not available
                let groupItems;
                if (bReq.reservation_expires_at) {
                    [groupItems] = await connection.query(
                        `SELECT * FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND reservation_expires_at = ?
                         AND equipment_id = ?
                         LIMIT 1 FOR UPDATE`,
                        [bReq.student_id, bReq.reservation_expires_at, pItem.equipment_id]
                    );
                } else {
                    [groupItems] = await connection.query(
                        `SELECT * FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND equipment_id = ?
                         LIMIT 1 FOR UPDATE`,
                        [bReq.student_id, pItem.equipment_id]
                    );
                }

                if (groupItems.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ success: false, message: "อุปกรณ์ที่สแกนไม่ตรงกับรายการที่กำลังขอยืม หรือสแกนรายการนี้ไปแล้ว" });
                }
                
                const targetReq = groupItems[0];

                await connection.query("UPDATE equipment_items SET status = 'borrowed' WHERE item_id = ?", [pItem.item_id]);
                await connection.query("UPDATE borrowed SET status = 'borrowed', pickup_time = NOW() WHERE id = ?", [targetReq.id]);

                // Count remaining pending items in the group
                let remainingPending;
                if (bReq.reservation_expires_at) {
                    [remainingPending] = await connection.query(
                        `SELECT COUNT(*) as count FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND reservation_expires_at = ?`,
                        [bReq.student_id, bReq.reservation_expires_at]
                    );
                } else {
                    [remainingPending] = await connection.query(
                        `SELECT COUNT(*) as count FROM borrowed 
                         WHERE student_id = ? AND status = 'pending' 
                         AND borrow_date >= DATE_SUB(?, INTERVAL 5 MINUTE)
                         AND borrow_date <= DATE_ADD(?, INTERVAL 5 MINUTE)`,
                        [bReq.student_id, bReq.borrow_date, bReq.borrow_date]
                    );
                }
                
                const remaining = remainingPending[0].count;

                await connection.commit();
                connection.release();

                req.app.get('io').emit('data_updated');
                req.app.get('io').emit('scan_success', {
                    type: 'pickup',
                    message: `จ่ายอุปกรณ์สำเร็จ (${pItem.full_asset_code}) เหลืออีก ${remaining} รายการ`,
                    barcode: pItem.full_asset_code
                });
                return res.json({ 
                    success: true, 
                    message: `สแกน ${pItem.full_asset_code} สำเร็จ`,
                    remaining: remaining
                });
            }
        } else {
            // --- HANDLE QUEUE REQUEST (Single item) ---
            const parsedQueueId = parseInt(queue_id, 10);
            if (isNaN(parsedQueueId)) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ success: false, message: "รหัสคิวไม่ถูกต้อง" });
            }

            const [queueItem] = await connection.query(
                "SELECT * FROM equipment_queue WHERE id = ? AND status = 'called' FOR UPDATE",
                [parsedQueueId]
            );
            if (queueItem.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ success: false, message: "ไม่พบรายการคิว หรือหมดอายุไปแล้ว" });
            }
            
            const q = queueItem[0];
            let pItem = null;

            if (barcode === 'AUTO') {
                const [autoItems] = await connection.query(
                    "SELECT * FROM equipment_items WHERE equipment_id = ? AND status = 'available' LIMIT 1 FOR UPDATE",
                    [q.equipment_id]
                );
                if (autoItems.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ success: false, message: "ไม่มีอุปกรณ์รุ่นนี้ว่างในสต๊อก" });
                }
                pItem = autoItems[0];
            } else {
                const [physicalItem] = await connection.query(
                    "SELECT * FROM equipment_items WHERE full_asset_code = ? AND status = 'available' FOR UPDATE",
                    [barcode]
                );
                if (physicalItem.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ success: false, message: "ไม่พบอุปกรณ์บาร์โค้ดนี้ หรือไม่พร้อมใช้งาน" });
                }
                
                pItem = physicalItem[0];
                if (pItem.equipment_id !== q.equipment_id) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ success: false, message: "บาร์โค้ดที่สแกนไม่ตรงกับรุ่นอุปกรณ์ที่จองไว้" });
                }
            }

            await connection.query("UPDATE equipment_items SET status = 'borrowed' WHERE item_id = ?", [pItem.item_id]);
            await connection.query("INSERT INTO borrowed (student_id, equipment_id, borrow_date, status) VALUES (?, ?, NOW(), 'borrowed')", [q.student_id, pItem.equipment_id]);
            await connection.query("UPDATE equipment_queue SET status = 'completed' WHERE id = ?", [q.id]);

            await connection.commit();
            connection.release();
            
            req.app.get('io').emit('data_updated');
            req.app.get('io').emit('scan_success', {
                type: 'pickup',
                message: `จ่ายอุปกรณ์ให้คิวสำเร็จ (รหัส ${pItem.full_asset_code})`,
                barcode: pItem.full_asset_code
            });
            return res.json({ success: true, message: "บันทึกการรับอุปกรณ์สำเร็จ", remaining: 0 });
        }
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error("Pickup Queue Error:", error);
        res.status(500).json({ success: false, message: "DB Error: " + (error.sqlMessage || error.message) });
    }
});

// ============================================================
// 14.5 Return Equipment by Barcode (Asset Code)
// ============================================================
router.post('/return_by_barcode.php', async (req, res) => {
    const { barcode } = req.body;
    
    if (!barcode) {
        return res.status(400).json({ success: false, message: "กรุณาระบุบาร์โค้ดอุปกรณ์" });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Find the physical equipment item by barcode
        const [items] = await connection.query(
            "SELECT * FROM equipment_items WHERE full_asset_code = ? FOR UPDATE",
            [barcode]
        );

        if (items.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "ไม่พบรหัสครุภัณฑ์นี้ในระบบ" });
        }

        const pItem = items[0];

        if (pItem.status !== 'borrowed') {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: `อุปกรณ์นี้ไม่ได้ถูกยืมอยู่ (สถานะปัจจุบัน: ${pItem.status})` });
        }

        // 2. Find the active borrowed record for this item (Model ID)
        const [borrows] = await connection.query(
            "SELECT * FROM borrowed WHERE equipment_id = ? AND status = 'borrowed' ORDER BY borrow_date ASC LIMIT 1 FOR UPDATE",
            [pItem.equipment_id]
        );

        if (borrows.length === 0) {
            // Edge case: item is marked borrowed but no active record found
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: "ไม่พบประวัติการยืมที่กำลังใช้งานของอุปกรณ์นี้" });
        }

        const bReq = borrows[0];

        // 3. Update records
        await connection.query(
            "UPDATE equipment_items SET status = 'available' WHERE item_id = ?",
            [pItem.item_id]
        );

        await connection.query(
            "UPDATE borrowed SET status = 'returned', return_date = NOW() WHERE id = ?",
            [bReq.id]
        );

        await connection.commit();
        connection.release();
        req.app.get('io').emit('data_updated');
        req.app.get('io').emit('scan_success', {
            type: 'return',
            message: `รับคืนอุปกรณ์สำเร็จ (รหัส ${pItem.full_asset_code}) สถานะอัปเดตเป็นว่างแล้ว`,
            barcode: pItem.full_asset_code
        });
        res.json({ success: true, message: "รับคืนอุปกรณ์สำเร็จ" });
    } catch (error) {
        if (connection) {
            await connection.rollback();
            connection.release();
        }
        console.error("Return by Barcode Error:", error);
        res.status(500).json({ success: false, message: "DB Error: " + (error.sqlMessage || error.message) });
    }
});

// ============================================================
// 15. Get Equipment Items
// ============================================================
router.get('/equipments/:id/items', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM equipment_items WHERE equipment_id = ? ORDER BY sequence_code ASC', [parseInt(id)]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 16. Update Equipment Item Status
// ============================================================
router.put('/equipment-items/:itemId/status', async (req, res) => {
    const { itemId } = req.params;
    const { status } = req.body;
    try {
        await pool.query('UPDATE equipment_items SET status = ? WHERE item_id = ?', [status, parseInt(itemId)]);
        req.app.get('io').emit('data_updated');
        res.json({ success: true, message: "อัปเดตสถานะสำเร็จ" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// Reports Generation
// ============================================================
router.get('/reports', async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        let sql = "";
        let params = [];
        let rows = [];

        let whereClause = "DATE(borrow_date) >= ? AND DATE(borrow_date) <= ?";
        let baseParams = [startDate, endDate];

        if (type === 'monthly') {
            sql = `
                SELECT 
                    MONTH(borrow_date) as report_month,
                    YEAR(borrow_date) as report_year,
                    COUNT(id) as total_borrows,
                    SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as total_returned,
                    SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as total_overdue
                FROM borrowed
                WHERE ${whereClause}
                GROUP BY YEAR(borrow_date), MONTH(borrow_date)
                ORDER BY report_year ASC, report_month ASC
            `;
            params = [...baseParams];
            const [resRows] = await pool.query(sql, params);
            rows = resRows;
        } 
        else if (type === 'yearly') {
            sql = `
                SELECT 
                    YEAR(borrow_date) as report_year,
                    COUNT(id) as total_borrows,
                    SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as total_returned,
                    SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as total_overdue
                FROM borrowed
                WHERE ${whereClause}
                GROUP BY YEAR(borrow_date)
                ORDER BY report_year ASC
            `;
            params = [...baseParams];
            const [resRows] = await pool.query(sql, params);
            rows = resRows;
        }
        else if (type === 'equipment_stats') {
            const sort = req.query.sort === 'asc' ? 'ASC' : 'DESC';
            sql = `
                SELECT 
                    e.name,
                    COUNT(b.id) as total_borrows
                FROM borrowed b
                JOIN equipments e ON b.equipment_id = e.equipment_id
                WHERE DATE(b.borrow_date) >= ? AND DATE(b.borrow_date) <= ?
                GROUP BY b.equipment_id
                ORDER BY total_borrows ${sort}
                LIMIT 20
            `;
            params = [...baseParams];
            const [resRows] = await pool.query(sql, params);
            rows = resRows;
        }

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Report generation error:", error);
        res.status(500).json({ success: false, message: "Error generating report" });
    }
});

// ============================================================
// Equipment Breakdown Report
// ============================================================
router.get('/reports/equipment-breakdown', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let whereClauses = ['DATE(b.borrow_date) >= ?', 'DATE(b.borrow_date) <= ?'];
        let params = [startDate, endDate];

        const sql = `
            SELECT 
                e.name as equipment_name,
                e.kit_code,
                e.category,
                COUNT(b.id) as total_borrows,
                SUM(CASE WHEN b.status = 'returned' THEN 1 ELSE 0 END) as total_returned,
                SUM(CASE WHEN b.status = 'overdue' THEN 1 ELSE 0 END) as total_overdue,
                SUM(CASE WHEN b.status = 'borrowed' THEN 1 ELSE 0 END) as currently_borrowed
            FROM borrowed b
            JOIN equipments e ON b.equipment_id = e.equipment_id
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY b.equipment_id, e.name, e.kit_code, e.category
            ORDER BY total_borrows DESC
        `;
        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Equipment breakdown report error:", error);
        res.status(500).json({ success: false, message: "Error generating equipment breakdown report" });
    }
});

// ============================================================
// Student Breakdown Report
// ============================================================
router.get('/reports/student-breakdown', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let whereClauses = ['DATE(b.borrow_date) >= ?', 'DATE(b.borrow_date) <= ?'];
        let params = [startDate, endDate];

        const sql = `
            SELECT 
                s.student_id,
                s.name_th as student_name,
                COUNT(b.id) as total_borrows,
                SUM(CASE WHEN b.status = 'returned' THEN 1 ELSE 0 END) as total_returned,
                SUM(CASE WHEN b.status = 'overdue' THEN 1 ELSE 0 END) as total_overdue,
                SUM(CASE WHEN b.status = 'borrowed' THEN 1 ELSE 0 END) as currently_borrowed
            FROM borrowed b
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY s.student_id, s.name_th
            ORDER BY total_borrows DESC
        `;
        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Student breakdown report error:", error);
        res.status(500).json({ success: false, message: "Error generating student breakdown report" });
    }
});

module.exports = router;

