require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const http = require('http');
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
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" ที่คุณยืมเลยกำหนดส่งคืนแล้ว กรุณานำมาคืนโดยเร็วที่สุด (มีค่าปรับล่าช้า 20 บาท/วัน)`;
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
                const notifMsg = `อุปกรณ์ "${row.equipment_name}" จะครบกำหนดคืนในอีก ${diffDays} วัน กรุณานำมาคืนภายในวันที่กำหนดเพื่อหลีกเลี่ยงค่าปรับ`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                mailer.sendManualNotification(row.student_email, notifTitle, notifMsg);
            }
        }
        console.log('[Cron] Due soon check complete.');
    } catch (error) {
        console.error('[Cron] Error checking due soon items:', error);
    }
});

// Cron job: Check every 1 minute for expired 30-min pickup reservations
cron.schedule('* * * * *', async () => {
    try {
        const sql = `
            SELECT b.id, b.student_id, b.equipment_id, e.name as equipment_name,
                   s.email as student_email, s.name_th as student_name,
                   b.pickup_time, b.reservation_expires_at
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.status = 'pending'
              AND b.reservation_expires_at IS NOT NULL
              AND NOW() > b.reservation_expires_at
        `;
        const [expiredRows] = await pool.query(sql);

        for (const row of expiredRows) {
            await pool.query("UPDATE borrowed SET status = 'rejected' WHERE id = ?", [row.id]);

            const notifTitle = "ยกเลิกคำขอยืมอุปกรณ์อัตโนมัติ";
            const notifMsg = `คำขอยืมอุปกรณ์ "${row.equipment_name}" ถูกยกเลิกอัตโนมัติ เนื่องจากเกินกำหนดเวลามารับ 30 นาที`;
            if (row.student_email) {
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [row.student_email, notifTitle, notifMsg]);
                mailer.sendManualNotification(row.student_email, notifTitle, notifMsg);
            }
            console.log(`[Cron] Cancelled expired reservation #${row.id} for equipment ${row.equipment_name}`);
        }

        if (expiredRows.length > 0) {
            io.emit('data_updated');
        }
    } catch (error) {
        console.error('[Cron] Error checking expired reservations:', error);
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
