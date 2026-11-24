require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'https://localhost:5175'
];

if (process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS.split(',').forEach(o => {
        const trimmed = o.trim();
        if (trimmed && trimmed !== '*' && !ALLOWED_ORIGINS.includes(trimmed)) {
            ALLOWED_ORIGINS.push(trimmed);
        }
    });
}

const CORS_ORIGINS = ALLOWED_ORIGINS;

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    if (origin === 'null' || origin === '*' || origin.includes('*')) return false;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    return /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
};

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    optionsSuccessStatus: 204
};

// ============================================================
// Express & Socket.io Setup
// ============================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: function (origin, callback) {
            callback(null, isAllowedOrigin(origin));
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Expose io to routes
app.set('io', io);

// Global Security Headers Middleware (Always sent on all responses: 200, 404, 500)
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob: http://localhost:5000 http://127.0.0.1:5000 http://localhost http://127.0.0.1; connect-src 'self' http://localhost:5000 ws://localhost:5000 http://127.0.0.1:5000 ws://127.0.0.1:5000;");
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    next();
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Managed custom headers above without wildcard conflicts
    frameguard: { action: "deny" },
    noSniff: true,
    hsts: { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

app.use(cors(corsOptions));
app.use(express.json());
const fs = require('fs');

// Safe Uploads Handler with strict Path Traversal & Directory Browsing Protection
const uploadsDir = path.resolve(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', (req, res, next) => {
    const rawUrl = req.url.split('?')[0];
    let decodedUrl = '';
    try {
        decodedUrl = decodeURIComponent(rawUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL encoding' });
    }

    if (decodedUrl.includes('..') || rawUrl.includes('%2e%2e') || rawUrl.includes('%2E%2E') || decodedUrl.includes('\0')) {
        return res.status(403).json({ error: 'Access denied: Directory traversal sequence blocked' });
    }

    const safeSuffix = path.normalize(decodedUrl).replace(/^(\.\.[\/\\])+/, '');
    const safeFilePath = path.resolve(uploadsDir, '.' + safeSuffix);

    if (!safeFilePath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied: Path outside uploads directory' });
    }

    if (fs.existsSync(safeFilePath) && fs.statSync(safeFilePath).isFile()) {
        res.sendFile(safeFilePath);
    } else {
        // Safe fallback to XAMPP server on port 80 for legacy equipment/student images
        const cleanPath = safeSuffix.replace(/\\/g, '/');
        const redirectUrl = `http://localhost/uploads${cleanPath.startsWith('/') ? '' : '/'}${encodeURI(cleanPath)}`;
        res.redirect(redirectUrl);
    }
});

// Root Health Check Route
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Library API Service is active' });
});

// Logger Middleware — ดู log กิจกรรม API ที่ถูกยิงมา
app.use((req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    next();
});

// Rate Limiting — จำกัดการยิง API Login ไม่เกิน 15 ครั้งต่อ 15 นาที
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: {
        success: false,
        message: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่อีกครั้ง'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// ============================================================
// Mount Routes
// ============================================================
app.use('/api/auth', loginLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', mobileRoutes);

// ============================================================
// Cron Jobs
// ============================================================

// Cron job for midnight tasks (Reset queues/reservations and check overdue)
cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily midnight tasks...');
    
    // ----------------------------------------------------
    // 1. Reset Reservations and Queues at 00:00
    // ----------------------------------------------------
    try {
        console.log('[Cron] Resetting daily queues and reservations...');
        
        // 1.1 Find pending reservations (status = 'pending' in borrowed)
        const [pendingReservations] = await pool.query(`
            SELECT b.id, e.name as equipment_name, s.email as student_email
            FROM borrowed b
            LEFT JOIN equipments e ON b.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON b.student_id = s.student_id
            WHERE b.status = 'pending'
        `);

        for (const resv of pendingReservations) {
            await pool.query("UPDATE borrowed SET status = 'cancelled' WHERE id = ?", [resv.id]);
            if (resv.student_email) {
                const notifTitle = "การจองถูกยกเลิก (สิ้นสุดวัน)";
                const notifMsg = `ระบบได้ยกเลิกการจองอุปกรณ์ "${resv.equipment_name}" ของคุณเนื่องจากสิ้นสุดวัน กรุณาทำรายการใหม่ในวันถัดไปหากยังต้องการใช้งาน`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [resv.student_email, notifTitle, notifMsg]);
            }
        }
        
        // 1.2 Find active queues (status IN ('waiting', 'called') in equipment_queue)
        const [activeQueues] = await pool.query(`
            SELECT q.id, e.name as equipment_name, s.email as student_email
            FROM equipment_queue q
            LEFT JOIN equipments e ON q.equipment_id = e.equipment_id
            LEFT JOIN student_profiles s ON q.student_id = s.student_id
            WHERE q.status IN ('waiting', 'called')
        `);

        for (const q of activeQueues) {
            await pool.query("UPDATE equipment_queue SET status = 'expired' WHERE id = ?", [q.id]);
            if (q.student_email) {
                const notifTitle = "คิวถูกยกเลิก (สิ้นสุดวัน)";
                const notifMsg = `ระบบได้ตัดคิวรออุปกรณ์ "${q.equipment_name}" ของคุณเนื่องจากสิ้นสุดวัน กรุณากดจองคิวใหม่ในวันถัดไป`;
                await pool.query("INSERT INTO notifications (target, title, message, type) VALUES (?, ?, ?, 'alert')", [q.student_email, notifTitle, notifMsg]);
            }
        }
        
        console.log(`[Cron] Reset ${pendingReservations.length} reservations and ${activeQueues.length} queues.`);
    } catch (error) {
        console.error('[Cron] Error resetting queues/reservations:', error);
    }
    
    // ----------------------------------------------------
    // 2. Overdue Items Check
    // ----------------------------------------------------
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

// 404 Handler for undefined routes (returns clean JSON with security headers)
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[API Error]', err.message || err);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`CORS origins: ${CORS_ORIGINS.join(', ')}`);
});
