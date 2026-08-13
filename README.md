<<<<<<< HEAD
# 📚 SUT Library Management System (ระบบยืม-คืนอุปกรณ์)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-success.svg)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=nodedotjs&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-Real--time-010101?logo=socketdotio&logoColor=white)

ระบบสารสนเทศเพื่อการจัดการยืม-คืนอุปกรณ์และครุภัณฑ์ภายในองค์กร/สถานศึกษา พัฒนาขึ้นเพื่อเพิ่มประสิทธิภาพในการให้บริการอุปกรณ์ ลดขั้นตอนการทำงานที่ซับซ้อน และเพิ่มความโปร่งใสในการจัดการทรัพยากร ด้วยระบบที่ครอบคลุมทั้งฝั่งผู้ใช้งาน (นักศึกษา) และผู้ดูแลระบบ (Admin) พร้อมการอัปเดตข้อมูลแบบ **Real-Time** ⚡
=======
## ✨ ฟีเจอร์หลัก (Key Features)

### 👨‍🎓 ฝั่งผู้ใช้งาน (User Web / Mobile)
- **Real-time Inventory:** ดูรายการอุปกรณ์ จำนวนคงเหลือ และสถานะการยืมแบบ Real-time (ทันทีที่มีคนยืม ของจะลดลงในระบบของทุกคนโดยอัตโนมัติ)
- **Smart Cart & Checkout:** ระบบตะกร้ายืมอุปกรณ์ พร้อมตรวจสอบสิทธิ์และข้อจำกัดอัตโนมัติ (เช่น จองล่วงหน้า ยืมได้สูงสุด 5 ชิ้น/วัน ฯลฯ)
- **Status Tracking:** ติดตามสถานะคำขอยืม (รออนุมัติ, กำลังยืม, คืนแล้ว, เลยกำหนด) และประวัติการทำรายการย้อนหลัง
- **QR Code Identity:** ระบบสร้าง QR Code ประจำตัวเพื่อยืนยันตัวตนตอนรับของ
- **Notifications:** รับอีเมลแจ้งเตือนเมื่อคำขอถูกอนุมัติ/ปฏิเสธ หรือเมื่ออุปกรณ์ใกล้ถึงกำหนดคืน
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54

### 👨‍💻 ฝั่งผู้ดูแลระบบ (Admin Dashboard)
- **Real-time Dashboard:** แดชบอร์ดสรุปสถิติ (ยอดการยืม, ของที่กำลังถูกยืม, ยอดที่เลยกำหนดคืน, ค่าปรับสะสม) ซึ่งจะอัปเดตตัวเลขแบบ Real-time เมื่อนักศึกษาทำรายการ
- **Request Management:** หน้าต่างจัดการคำขอ (อนุมัติ, ปฏิเสธ, หรือรับคืนอุปกรณ์) พร้อมคำนวณค่าปรับกรณีส่งล่าช้า หรือสูญหาย
- **Equipment Inventory:** จัดการข้อมูลครุภัณฑ์ เพิ่ม/ลบ/แก้ไขข้อมูล พร้อมอัปโหลดรูปภาพ (มีระบบ Smart Image Fallback ดึงรูปสำรองอัจฉริยะ)
- **Automated Cron Jobs:** ระบบตรวจสอบอัตโนมัติทำงานเบื้องหลัง:
  - ยกเลิกคำขอที่เลยเวลารับของ (30 นาที) อัตโนมัติ พร้อมคืนจำนวนสต็อก
  - ตรวจสอบรายการที่ค้างส่ง (Overdue) แบบอัตโนมัติทุกวัน และอัปเดตสถานะในระบบ
  - ส่งอีเมลแจ้งเตือนผู้ใช้งานที่ใกล้ถึงกำหนดคืน และแจ้งเตือนด่วนสำหรับของที่ต้องคืนในวันนี้
---
<<<<<<< HEAD

## ✨ ฟีเจอร์หลัก (Key Features)

### 👨‍🎓 ฝั่งผู้ใช้งาน (User Web / Mobile)
- **Real-time Inventory:** ดูรายการอุปกรณ์ จำนวนคงเหลือ และสถานะการยืมแบบ Real-time (ทันทีที่มีคนยืม ของจะลดลงในระบบของทุกคนโดยอัตโนมัติ)
- **Smart Cart & Checkout:** ระบบตะกร้ายืมอุปกรณ์ พร้อมตรวจสอบสิทธิ์และข้อจำกัดอัตโนมัติ (เช่น จองล่วงหน้า ยืมได้สูงสุด 5 ชิ้น/วัน ฯลฯ)
- **Status Tracking:** ติดตามสถานะคำขอยืม (รออนุมัติ, กำลังยืม, คืนแล้ว, เลยกำหนด) และประวัติการทำรายการย้อนหลัง
- **QR Code Identity:** ระบบสร้าง QR Code ประจำตัวเพื่อยืนยันตัวตนตอนรับของ
- **Notifications:** รับอีเมลแจ้งเตือนเมื่อคำขอถูกอนุมัติ/ปฏิเสธ หรือเมื่ออุปกรณ์ใกล้ถึงกำหนดคืน

### 👨‍💻 ฝั่งผู้ดูแลระบบ (Admin Dashboard)
- **Real-time Dashboard:** แดชบอร์ดสรุปสถิติ (ยอดการยืม, ของที่กำลังถูกยืม, ยอดที่เลยกำหนดคืน, ค่าปรับสะสม) ซึ่งจะอัปเดตตัวเลขแบบ Real-time เมื่อนักศึกษาทำรายการ
- **Request Management:** หน้าต่างจัดการคำขอ (อนุมัติ, ปฏิเสธ, หรือรับคืนอุปกรณ์) พร้อมคำนวณค่าปรับกรณีส่งล่าช้า หรือสูญหาย
- **Equipment Inventory:** จัดการข้อมูลครุภัณฑ์ เพิ่ม/ลบ/แก้ไขข้อมูล พร้อมอัปโหลดรูปภาพ (มีระบบ Smart Image Fallback ดึงรูปสำรองอัจฉริยะ)
- **Automated Cron Jobs:** ระบบตรวจสอบอัตโนมัติทำงานเบื้องหลัง:
  - ยกเลิกคำขอที่เลยเวลารับของ (30 นาที) อัตโนมัติ พร้อมคืนจำนวนสต็อก
  - ตรวจสอบรายการที่ค้างส่ง (Overdue) แบบอัตโนมัติทุกวัน และอัปเดตสถานะในระบบ
  - ส่งอีเมลแจ้งเตือนผู้ใช้งานที่ใกล้ถึงกำหนดคืน และแจ้งเตือนด่วนสำหรับของที่ต้องคืนในวันนี้

---

## 🗂 โครงสร้างโปรเจกต์ (Project Architecture)

โปรเจกต์นี้ถูกออกแบบเป็น Micro-frontend & Monorepo สไตล์ โดยแบ่งออกเป็น 4 ส่วนหลัก:

=======
## 🗂 โครงสร้างโปรเจกต์ (Project Architecture)
โปรเจกต์นี้ถูกออกแบบเป็น Micro-frontend & Monorepo สไตล์ โดยแบ่งออกเป็น 4 ส่วนหลัก:
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
| โฟลเดอร์ | รายละเอียด | เทคโนโลยี |
| --- | --- | --- |
| 📁 `my-library-user-web` | เว็บแอปพลิเคชันสำหรับผู้ใช้ทั่วไป (ค้นหา/จอง/ยืม/เช็คสถานะ) | React (Vite) + Tailwind CSS |
| 📁 `my-library-admin-web` | เว็บไซต์ระบบหลังบ้านสำหรับเจ้าหน้าที่ (Dashboard/จัดการคำขอ) | React (Vite) + Tailwind CSS |
| 📁 `my-library-api-node` | API Server หลักที่ประมวลผลการทำงานทั้งหมด | Node.js (Express) + MySQL + Socket.IO |
| 📁 `my-library-mobile` | (Optional) แอปพลิเคชันมือถือสำหรับนักศึกษา | React Native (Expo) |
<<<<<<< HEAD

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

=======
---
## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
**Frontend:**
- React (Vite) - *Fast and modern UI building*
- Tailwind CSS - *Rapid styling and responsive design*
- Lucide React - *Beautiful icons*
- Socket.IO-Client - *Listening for live data updates*
<<<<<<< HEAD

=======
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
**Backend:**
- Node.js & Express.js - *High-performance API server*
- MySQL2 - *Relational database driver*
- Socket.IO - *WebSockets for broadcasting real-time events*
- Node-Cron - *Task automation for expiration and reminders*
- Nodemailer - *For sending emails via SMTP*
- Multer & Jimp - *Image uploading and compression processing*
<<<<<<< HEAD

---

=======
---
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
## 🚀 วิธีการติดตั้งและใช้งาน (Getting Started)

### ⚙️ สิ่งที่ต้องเตรียม (Prerequisites)
- [Node.js](https://nodejs.org/) (เวอร์ชัน 18 ขึ้นไป)
- MySQL Server (เช่น [XAMPP](https://www.apachefriends.org/) หรือ [Laragon](https://laragon.org/))
<<<<<<< HEAD

### 1. การตั้งค่าฐานข้อมูล (Database Setup)
1. เปิดการทำงานของ MySQL Server ผ่าน XAMPP / Laragon
2. สร้าง Database (เช่นชื่อ `my_library`) และนำเข้าไฟล์ฐานข้อมูล `database.sql` ของคุณ (ถ้ามี)
3. ในโฟลเดอร์ `my-library-api-node` ให้คัดลอกไฟล์ `.env.example` มาเป็นชื่อ `.env` และตั้งค่าต่างๆ:
   - การเชื่อมต่อฐานข้อมูล (DB Host, User, Password)
   - ข้อมูล SMTP (Email / App Password) 
   - กำหนดพอร์ตของระบบ

=======
### 1. การตั้งค่าฐานข้อมูล (Database Setup)
1. เปิดการทำงานของ MySQL Server ผ่าน XAMPP / Laragon
2. สร้าง Database (เช่นชื่อ `my_library`) และนำเข้าไฟล์ฐานข้อมูล `database.sql` ของคุณ (ถ้ามี)
3. ในโฟลเดอร์ `my-library-api-node` ให้คัดลอกไฟล์ `.env.example` มาเป็นชื่อ `.env` และตั้งค่าต่างๆ:
   - การเชื่อมต่อฐานข้อมูล (DB Host, User, Password)
   - ข้อมูล SMTP (Email / App Password) 
   - กำหนดพอร์ตของระบบ

>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
### 2. รัน API Server (Backend)
เปิด Terminal และเข้าไปที่โฟลเดอร์ของ API จากนั้นรันคำสั่ง:
```bash
cd my-library-api-node
npm install
node server.js
```
*(เซิร์ฟเวอร์จะรันอยู่ที่ `http://localhost:5000`)*

### 3. รันเว็บ Admin
เปิด Terminal อันใหม่ จากนั้นรันคำสั่ง:
```bash
cd my-library-admin-web
npm install
npm run dev
```
*(เข้าใช้งานระบบ Admin ผ่านเบราว์เซอร์ที่ `http://localhost:5173`)*

### 4. รันเว็บ User (ผู้ยืม)
เปิด Terminal อันใหม่ จากนั้นรันคำสั่ง:
```bash
cd my-library-user-web
npm install
npm run dev
```
*(เข้าใช้งานระบบนักศึกษา ผ่านเบราว์เซอร์ที่ `http://localhost:5174`)*
<<<<<<< HEAD

---

=======
---
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
## 🔮 แผนการพัฒนาในอนาคต (Roadmap)
- [ ] เพิ่มระบบสแกนบาร์โค้ดครุภัณฑ์ผ่านกล้องเว็บแคมเพื่อตัดสต๊อก
- [ ] พัฒนาระบบออกรายงานสรุปผลรายเดือนเป็นไฟล์ PDF / Excel
- [ ] เชื่อมต่อระบบ Single Sign-On (SSO) ขององค์กร
<<<<<<< HEAD

---
*Developed with ❤️ for better educational support systems.*
=======
>>>>>>> 7c5bd8be5938f949430f82e2156d3fa92924eb54
