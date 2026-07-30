const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'project-libraries-secret-key-2026';

/**
 * Auth Middleware — ตรวจสอบ JWT Token จาก Authorization header
 * ถ้า token ถูกต้อง จะ set req.user ให้ใช้ใน route ต่อไป
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Token)'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
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

module.exports = authMiddleware;
