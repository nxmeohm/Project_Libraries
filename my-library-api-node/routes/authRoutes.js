const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const pool = require('../db');
const validate = require('../middleware/validate');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'project-libraries-secret-key-2026';
const TOKEN_EXPIRY = '8h';

// ============================================================
// Validation Schemas
// ============================================================
const adminLoginSchema = {
    body: z.object({
        adminCode: z.string().regex(/^\d{6}$/, 'รหัส Admin ต้องเป็นตัวเลข 6 หลัก'),
        password: z.string().regex(/^\d{13}$/, 'รหัสผ่านต้องเป็นตัวเลข 13 หลัก')
    })
};

const userLoginSchema = {
    body: z.object({
        studentId: z.string().regex(/^B\d{7}$/, 'รหัสนักศึกษาต้องขึ้นต้นด้วย B ตามด้วยตัวเลข 7 หลัก'),
        citizenId: z.string().length(13, 'เลขบัตรประชาชนต้องมี 13 หลัก')
    })
};

// ============================================================
// 1. Admin Login
// ============================================================
router.post('/admin-login', validate(adminLoginSchema), async (req, res) => {
    const { adminCode, password } = req.body;

    try {
        const [rows] = await pool.query(
            "SELECT emp_id, citizen_id, name_th, name_en, email, phone FROM employees WHERE emp_id = ? AND citizen_id = ?",
            [adminCode, password]
        );

        if (rows.length > 0) {
            const admin = rows[0];
            const token = jwt.sign(
                { id: admin.emp_id, role: 'admin', email: admin.email },
                JWT_SECRET,
                { expiresIn: TOKEN_EXPIRY }
            );

            res.json({
                success: true,
                message: "Login successful",
                token,
                data: admin
            });
        } else {
            res.json({ success: false, message: "รหัส Admin หรือรหัสผ่านไม่ถูกต้อง" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// ============================================================
// 2. Student / User Login (Mobile & User Web)
// ============================================================
router.post('/user-login', validate(userLoginSchema), async (req, res) => {
    const { studentId, citizenId } = req.body;

    try {
        const [rows] = await pool.query(
            "SELECT * FROM users WHERE username = ? AND password = ?",
            [studentId, citizenId]
        );

        if (rows.length > 0) {
            const token = jwt.sign(
                { id: studentId, role: 'student' },
                JWT_SECRET,
                { expiresIn: TOKEN_EXPIRY }
            );

            res.json({
                success: true,
                message: "Login successful",
                token
            });
        } else {
            res.json({ success: false, message: "Invalid credentials" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

module.exports = router;
