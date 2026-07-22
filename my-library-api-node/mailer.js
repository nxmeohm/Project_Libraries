require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (to, subject, html) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || process.env.EMAIL_USER.includes('your.email')) {
        console.log(`[Email Skipped] Setup required. Would have sent to ${to}: ${subject}`);
        return false;
    }
    
    try {
        const info = await transporter.sendMail({
            from: `"Project Libraries" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log("Email sent: %s", info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
};

const sendApprovalEmail = (email, studentName, equipmentName) => {
    const subject = "อนุมัติการยืมอุปกรณ์สำเร็จ";
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4CAF50;">✅ ยืนยันยืมอุปกรณ์สำเร็จ</h2>
            <p>สวัสดีคุณ <strong>${studentName}</strong>,</p>
            <p>คำขอยืมอุปกรณ์ <strong>"${equipmentName}"</strong> ของคุณได้รับการอนุมัติเรียบร้อยแล้ว!</p>
            <p>กรุณาไปรับอุปกรณ์ที่ห้องสมุด และส่งคืนภายในกำหนดเวลา</p>
            <hr />
            <p style="font-size: 12px; color: #888;">ระบบห้องสมุด Project Libraries</p>
        </div>
    `;
    return sendEmail(email, subject, html);
};

const sendReturnEmail = (email, studentName, equipmentName) => {
    const subject = "คืนอุปกรณ์สำเร็จ";
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #2196F3;">✅ คืนอุปกรณ์สำเร็จ</h2>
            <p>สวัสดีคุณ <strong>${studentName}</strong>,</p>
            <p>เราได้รับ <strong>"${equipmentName}"</strong> คืนเข้าสู่ระบบเรียบร้อยแล้ว!</p>
            <p>ขอบคุณที่ใช้บริการและรักษาอุปกรณ์เป็นอย่างดีครับ/ค่ะ</p>
            <hr />
            <p style="font-size: 12px; color: #888;">ระบบห้องสมุด Project Libraries</p>
        </div>
    `;
    return sendEmail(email, subject, html);
};

const sendManualNotification = (email, title, message) => {
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #FF9800;">🔔 ${title}</h2>
            <p style="font-size: 16px;">${message.replace(/\n/g, '<br/>')}</p>
            <hr />
            <p style="font-size: 12px; color: #888;">ระบบห้องสมุด Project Libraries</p>
        </div>
    `;
    return sendEmail(email, title, html);
};

const sendFineEmail = (email, studentName, equipmentName, fineAmount) => {
    const subject = "แจ้งเตือนค่าปรับอุปกรณ์สูญหาย/เสียหาย";
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #F44336;">⚠️ แจ้งเตือนค่าปรับอุปกรณ์สูญหาย/เสียหาย</h2>
            <p>เรียนคุณ <strong>${studentName}</strong>,</p>
            <p>ระบบได้รับแจ้งว่าอุปกรณ์ <strong>"${equipmentName}"</strong> ที่คุณยืมไป เกิดการสูญหายหรือชำรุดเสียหาย</p>
            <p style="font-size: 16px;"><strong>ค่าปรับที่ต้องชำระ: <span style="color: #F44336;">${fineAmount} บาท</span></strong></p>
            <p>กรุณาติดต่อบรรณารักษ์หรือเจ้าหน้าที่ห้องสมุดเพื่อชำระค่าปรับและดำเนินการขั้นตอนต่อไปโดยเร็วที่สุด</p>
            <hr />
            <p style="font-size: 12px; color: #888;">ระบบห้องสมุด Project Libraries</p>
        </div>
    `;
    return sendEmail(email, subject, html);
};

const sendFinePaidEmail = (email, studentName, equipmentName) => {
    const subject = "ใบเสร็จชำระค่าปรับสำเร็จ";
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #009688;">✅ การชำระค่าปรับเสร็จสมบูรณ์</h2>
            <p>เรียนคุณ <strong>${studentName}</strong>,</p>
            <p>ระบบได้รับยอดชำระค่าปรับสำหรับกรณีอุปกรณ์ <strong>"${equipmentName}"</strong> สูญหาย/ชำรุดเสียหาย เรียบร้อยแล้ว</p>
            <p>ขอบคุณที่ให้ความร่วมมือ หากมีข้อสงสัยเพิ่มเติม สามารถติดต่อบรรณารักษ์ได้ตลอดเวลาครับ/ค่ะ</p>
            <hr />
            <p style="font-size: 12px; color: #888;">ระบบห้องสมุด Project Libraries</p>
        </div>
    `;
    return sendEmail(email, subject, html);
};

module.exports = { sendApprovalEmail, sendReturnEmail, sendManualNotification, sendFineEmail, sendFinePaidEmail };
