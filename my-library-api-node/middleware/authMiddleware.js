const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// ป้องกันกรณีลืมตั้งค่า JWT_SECRET ใน .env
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET is not defined in environment variables.');
    process.exit(1);
}

/**
 * Auth Middleware — ตรวจสอบ JWT Token จาก Authorization header เท่านั้น
 * ไม่ยอมรับ Fallback ผ่าน query/body เพื่อป้องกัน Identity Spoofing
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing Authorization Token)'
        });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
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
