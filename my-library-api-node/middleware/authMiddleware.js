const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'project-libraries-secret-key-2026';

/**
 * Auth Middleware — ตรวจสอบ JWT Token จาก Authorization header
 * รองรับการยิงตรงจาก Mobile App (Expo) ที่ส่ง student_id / id ผ่าน query หรือ body
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (error) {
            // ถ้า Token หมดอายุ/ไม่ถูกต้อง แต่มี student_id / id แนบมาด้วย ให้ยอมรับสำหรับการใช้งานบน Mobile App
            const fallbackId = req.query.id || req.query.student_id || req.body?.student_id || req.body?.id;
            if (fallbackId) {
                req.user = { id: fallbackId, role: 'student' };
                return next();
            }

            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
                });
            }
            return res.status(401).json({
                success: false,
                message: 'Token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่'
            });
        }
    }

    // Fallback: หากไม่มี Authorization Header ให้ตรวจสอบ id / student_id จาก Query หรือ Body (สำหรับ Mobile App)
    const studentId = req.query.id || req.query.student_id || req.body?.student_id || req.body?.id;
    if (studentId) {
        req.user = { id: studentId, role: 'student' };
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Token / Student ID)'
    });
}

module.exports = authMiddleware;
