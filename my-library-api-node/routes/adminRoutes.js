const express = require('express');
const { z } = require('zod');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const generateChartData = require('../generate_chart_data');
const mailer = require('../mailer');

const router = express.Router();

// ============================================================
// All admin routes require authentication
// ============================================================
router.use(authMiddleware);

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
                    calculated_fine = overdue_days * 20;
                }
            } else if (row.status === 'returned' || row.status === 'fine_paid' || row.status === 'damaged_lost') {
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
    else if (action === 'fine_paid') new_status = "fine_paid";
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

        if (action === 'return' || action === 'reject' || action === 'lost') {
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
            if (fine && parseFloat(fine) > 0) {
                await connection.query("UPDATE borrowed SET status = ?, return_date = NOW(), fine_amount = ? WHERE id = ?", [new_status, parseFloat(fine), id]);
            } else {
                await connection.query("UPDATE borrowed SET status = ?, return_date = NOW() WHERE id = ?", [new_status, id]);
            }
        } else if (action === 'lost') {
            await connection.query("UPDATE borrowed SET status = ?, return_date = NOW(), fine_amount = ? WHERE id = ?", [new_status, parseFloat(fine || 0), id]);
        } else if (action === 'fine_paid') {
            await connection.query("UPDATE borrowed SET status = ? WHERE id = ?", [new_status, id]);
            
            // Restore damaged equipment back to available
            const equip_id = borrowInfo.equipment_id;
            const [lostItem] = await connection.query(
                "SELECT item_id FROM equipment_items WHERE equipment_id = ? AND status = 'damaged_lost' LIMIT 1 FOR UPDATE",
                [equip_id]
            );
            if (lostItem.length > 0) {
                await connection.query("UPDATE equipment_items SET status = 'available' WHERE item_id = ?", [lostItem[0].item_id]);
            }
        } else {
            await connection.query("UPDATE borrowed SET status = ? WHERE id = ?", [new_status, id]);
        }

        await connection.commit();
        connection.release();

        // Send emails AFTER successful transaction (non-blocking)
        setImmediate(async () => {
            try {
                if (action === 'return') {
                    if (fine && parseFloat(fine) > 0) {
                        if (borrowInfo.student_email) {
                            mailer.sendReturnWithFineEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name, fine);
                        }
                    } else {
                        if (borrowInfo.student_email) {
                            mailer.sendReturnEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                        }
                    }
                } else if (action === 'lost') {
                    if (borrowInfo.student_email) {
                        mailer.sendFineEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name, fine || 0);
                        const notifTitle = "แจ้งเตือนค่าปรับอุปกรณ์";
                        const notifMsg = `อุปกรณ์ "${borrowInfo.equipment_name}" สูญหาย/ชำรุดเสียหาย คุณมียอดค่าปรับที่ต้องชำระจำนวน ${fine || 0} บาท ติดต่อบรรณารักษ์ด่วน`;
                        await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
                    }
                } else if (action === 'fine_paid') {
                    if (borrowInfo.student_email) {
                        mailer.sendFinePaidEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
                        const notifTitle = "ชำระค่าปรับสำเร็จ";
                        const notifMsg = `ขอบคุณครับ/ค่ะ ระบบได้รับยอดชำระค่าปรับสำหรับอุปกรณ์ "${borrowInfo.equipment_name}" เรียบร้อยแล้ว`;
                        await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [borrowInfo.student_email, notifTitle, notifMsg]);
                    }
                } else if (action === 'approve') {
                    if (borrowInfo.student_email) {
                        mailer.sendApprovalEmail(borrowInfo.student_email, borrowInfo.student_name, borrowInfo.equipment_name);
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
router.post('/notifications', validate(notificationSchema), async (req, res) => {
    const { target, title, message } = req.body;

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
        const sql = "SELECT e.*, (SELECT COUNT(*) FROM equipment_items WHERE equipment_id = e.equipment_id AND status = 'available') AS available_quantity FROM equipments e ORDER BY e.equipment_id DESC";
        const [rows] = await pool.query(sql);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 7. Add Equipment
// ============================================================
router.post('/equipments', validate(addEquipmentSchema), async (req, res) => {
    const { name, kit_code, category, total_quantity, available_quantity, borrow_days, price, description, status: equipStatus } = req.body;
    try {
        const sql = `INSERT INTO equipments (kit_code, name, total_quantity, description, usage_type, price, category, borrow_days, status) 
                     VALUES (?, ?, ?, ?, 'internal', ?, ?, ?, ?)`;
        const [result] = await pool.query(sql, [
            kit_code, name, total_quantity, description, price, category, borrow_days, equipStatus
        ]);
        const equipment_id = result.insertId;

        for(let i=0; i < total_quantity; i++) {
            const status = (i < available_quantity) ? 'available' : 'borrowed';
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

// ============================================================
// 8. Update Equipment
// ============================================================
router.put('/equipments/:id', async (req, res) => {
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
            const diff = total - existing.length;
            for(let i=0; i < diff; i++) {
                const seq = `c.${existing.length + i + 1}`;
                const asset = `add-${Date.now()}-${i}`;
                await pool.query("INSERT INTO equipment_items (equipment_id, sequence_code, full_asset_code, status) VALUES (?, ?, ?, 'available')", [parseInt(id), seq, asset]);
            }
        } else if (total < existing.length) {
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

module.exports = router;
