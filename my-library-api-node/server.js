require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mailer = require('./mailer');
const cron = require('node-cron');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mobileRoutes = require('./routes/mobileRoutes');

// ============================================================
// CORS Configuration
// ============================================================
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174'];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // In development, allow all. Tighten in production.
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
};

// ============================================================
// Express & Socket.io Setup
// ============================================================
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

app.use(cors(corsOptions));
app.use(express.json());
const fs = require('fs');
app.use('/uploads', (req, res, next) => {
    const filePath = path.join(__dirname, 'uploads', req.url.split('?')[0]);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        express.static(path.join(__dirname, 'uploads'))(req, res, next);
    } else {
        // Fallback to old XAMPP server
        res.redirect(`http://localhost/uploads${req.url}`);
    }
});

// Logger Middleware — ดู log กิจกรรม API ที่ถูกยิงมา
app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
});

// ============================================================
// Mount Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', mobileRoutes);

// ============================================================
// Cron Jobs
// ============================================================

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
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" ที่คุณยืมเลยกำหนดส่งคืนแล้ว กรุณานำมาคืนโดยเร็วที่สุด`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
            }
        }
        console.log('[Cron] Overdue check complete.');
    } catch (error) {
        console.error('[Cron] Error checking overdue items:', error);
    }
});

// Cron job to check for items due soon (1, 2, 3 days left) every morning at 8:00 AM
cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Running daily due soon check...');
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const row of rows) {
            const dueDate = new Date(row.borrow_date);
            dueDate.setDate(dueDate.getDate() + (row.borrow_days || 0));
            dueDate.setHours(0, 0, 0, 0);
            
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if ([1, 2, 3].includes(diffDays) && row.student_email) {
                const notifTitle = "แจ้งเตือนใกล้ครบกำหนดคืนอุปกรณ์";
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" จะครบกำหนดคืนในอีก ${diffDays} วัน กรุณานำมาคืนภายในวันที่กำหนด`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                mailer.sendManualNotification(row.student_email, notifTitle, notifMsg);
            }
        }
        console.log('[Cron] Due soon check complete.');
    } catch (error) {
        console.error('[Cron] Error checking due soon items:', error);
    }
});

// Cron job to send urgent reminder at 16:00 for items due TODAY
cron.schedule('0 16 * * *', async () => {
    console.log('[Cron] Running daily urgent reminder check (16:00)...');
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
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (const row of rows) {
            const dueDate = new Date(row.borrow_date);
            dueDate.setDate(dueDate.getDate() + (row.borrow_days || 0));
            dueDate.setHours(0, 0, 0, 0);
            
            // If it's due TODAY, diffDays should be exactly 0
            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0 && row.student_email) {
                const notifTitle = "แจ้งเตือนด่วน: อุปกรณ์ครบกำหนดคืนวันนี้";
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" จะครบกำหนดคืนภายในวันนี้ กรุณานำมาคืนก่อนห้องสมุดปิด เพื่อให้คิวจองถัดไปใช้งานต่อได้`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                if (mailer.sendUrgentReminderEmail) {
                    mailer.sendUrgentReminderEmail(row.student_email, row.student_name, row.equipment_name);
                }
            }
        }
        console.log('[Cron] Urgent reminder check complete.');
    } catch (error) {
        console.error('[Cron] Error checking urgent items:', error);
    }
});
// Cron job: Check every 1 minute for expired queue calls (5-min window)
cron.schedule('* * * * *', async () => {
    try {
        const sql = `
            SELECT q.id, q.student_id, q.equipment_id, e.name as equipment_name,
                   s.email as student_email, s.name_th as student_name,
                   q.called_at, q.expires_at
            FROM equipment_queue q
            LEFT JOIN equipments e ON q.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON q.student_id = s.student_id
            WHERE q.status = 'called'
              AND q.expires_at IS NOT NULL
              AND NOW() > q.expires_at
        `;
        const [expiredRows] = await pool.query(sql);

        for (const row of expiredRows) {
            // Mark as expired
            await pool.query("UPDATE equipment_queue SET status = 'expired' WHERE id = ?", [row.id]);

            // Notify the expired student
            const notifTitle = "คิวของคุณหมดอายุ";
            const notifMsg = `คิวสำหรับอุปกรณ์ "${row.equipment_name}" ถูกข้ามอัตโนมัติเนื่องจากเกินเวลา 5 นาที`;
            if (row.student_email) {
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                mailer.sendManualNotification(row.student_email, notifTitle, notifMsg);
            }
            console.log(`[Cron] Expired queue #${row.id} for equipment ${row.equipment_name}`);

            // Re-order remaining positions
            const [remaining] = await pool.query(
                "SELECT id FROM equipment_queue WHERE equipment_id = ? AND status IN ('waiting', 'called') ORDER BY position ASC",
                [row.equipment_id]
            );
            for (let i = 0; i < remaining.length; i++) {
                await pool.query("UPDATE equipment_queue SET position = ? WHERE id = ?", [i + 1, remaining[i].id]);
            }

            // Call next in queue
            const adminRoutes = require('./routes/adminRoutes');
            await adminRoutes.callNextInQueue(row.equipment_id, io);
        }

        if (expiredRows.length > 0) {
            io.emit('data_updated');
        }

        // Also check old-style expired pickup reservations (backward compat)
        const [oldExpired] = await pool.query(`
            SELECT b.id, b.student_id, b.equipment_id, e.name as equipment_name,
                   s.email as student_email, s.name_th as student_name
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.status = 'pending'
              AND b.reservation_expires_at IS NOT NULL
              AND NOW() > b.reservation_expires_at
        `);
        for (const row of oldExpired) {
            await pool.query("UPDATE borrowed SET status = 'rejected' WHERE id = ?", [row.id]);
            if (row.student_email) {
                const notifTitle = "ยกเลิกคำขอยืมอุปกรณ์อัตโนมัติ";
                const notifMsg = `คำขอยืมอุปกรณ์ "${row.equipment_name}" ถูกยกเลิกอัตโนมัติ เนื่องจากเกินกำหนดเวลามารับ`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                mailer.sendManualNotification(row.student_email, notifTitle, notifMsg);
            }
        }
        if (oldExpired.length > 0) {
            io.emit('data_updated');
        }
    } catch (error) {
        console.error('[Cron] Error checking expired queue/reservations:', error);
    }
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
});
