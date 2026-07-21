# 📚 Project Libraries (ระบบยืม-คืนอุปกรณ์)

ระบบยืม-คืนอุปกรณ์ที่พัฒนาขึ้นเพื่ออำนวยความสะดวกในการยืมและคืนอุปกรณ์ต่างๆ ภายในองค์กรหรือสถานศึกษา โดยแบ่งการทำงานออกเป็นแอปพลิเคชันสำหรับผู้ใช้งานทั่วไป (นักศึกษา) และระบบจัดการสำหรับเจ้าหน้าที่ (Admin)

## 🗂 โครงสร้างโปรเจกต์ (Project Structure)

โปรเจกต์นี้ประกอบด้วยส่วนสำคัญ 3 ส่วนหลัก ดังนี้:

### 1. `my-library-mobile` (แอปพลิเคชันสำหรับนักศึกษา)
แอปพลิเคชันมือถือพัฒนาด้วย **React Native (Expo)** 
- **ฟีเจอร์หลัก:**
  - ค้นหาและดูรายละเอียดอุปกรณ์แบบ Real-time
  - ตรวจสอบสถานะของอุปกรณ์ (พร้อมใช้งาน, งดใช้ชั่วคราว, กำลังซ่อมแซม ฯลฯ)
  - เพิ่มอุปกรณ์ลงตะกร้าและทำการยืม
  - สแกน QR Code

### 2. `my-library-admin-web` (เว็บไซต์ระบบจัดการหลังบ้านสำหรับ Admin)
เว็บไซต์ระบบจัดการพัฒนาด้วย **React (Vite) + Tailwind CSS**
- **ฟีเจอร์หลัก:**
  - Dashboard สรุปสถิติการยืม-คืน (รายวัน, รายเดือน, รายปี)
  - ระบบจัดการคลังอุปกรณ์ (เพิ่ม, แก้ไข, ลบ, เปลี่ยนสถานะ, ดูรูปภาพพรีวิว)
  - ระบบจัดการผู้ใช้งานนักศึกษา

### 3. `my-library-api-node` (API Server สำหรับ Admin)
เซิร์ฟเวอร์หลังบ้านพัฒนาด้วย **Node.js (Express) + MySQL**
- **ฟีเจอร์หลัก:**
  - API endpoints สำหรับระบบ Admin (พอร์ต `5000`)
  - ควบคุมการดึงข้อมูล อัปเดต และแก้ไขฐานข้อมูล

*(หมายเหตุ: API สำหรับส่วนของ Mobile App พัฒนาด้วย **PHP** และรันอยู่บนเซิร์ฟเวอร์ Laragon)*

---

## 🚀 วิธีการติดตั้งและรันโปรเจกต์ (Getting Started)

### ⚙️ สิ่งที่ต้องเตรียม (Prerequisites)
- [Node.js](https://nodejs.org/)
- [Laragon](https://laragon.org/) หรือ [XAMPP](https://www.apachefriends.org/) สำหรับรัน PHP และ MySQL Database
- แอปพลิเคชัน **Expo Go** บนมือถือ

### 1. การตั้งค่าฐานข้อมูล (Database)
1. เปิด Laragon/XAMPP และ Start Apache กับ MySQL
2. นำโฟลเดอร์ไฟล์ API (PHP) ไปวางไว้ที่ `C:\laragon\www\my_library_api`

### 2. รัน Admin API (Node.js)
```bash
cd my-library-api-node
npm install
npm run start
```
*(ระบบจะทำงานที่ `http://localhost:5000`)*

### 3. รัน Admin Web (React Vite)
```bash
cd my-library-admin-web
npm install
npm run dev
```
*(เข้าใช้งานผ่านเว็บเบราว์เซอร์ที่ `http://localhost:5173`)*

### 4. รัน Mobile App (Expo)
```bash
cd my-library-mobile
npm install
npx expo start -c
```
*(สแกน QR Code ที่แสดงใน Terminal ด้วยแอป Expo Go บนมือถือของคุณ)*

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)
- **Frontend (Web):** React, Vite, Tailwind CSS, Lucide React
- **Frontend (Mobile):** React Native, Expo
- **Backend:** Node.js (Express) & PHP
- **Database:** MySQL

---
*Created by [nxmeohm]*
