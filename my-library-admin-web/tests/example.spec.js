import { test, expect } from '@playwright/test';

test.describe('หน้า Login ของระบบ Libraries Admin', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // เคสที่ 1: ตรวจสอบการแสดงผลหน้าจอ Login เบื้องต้น
  test('แสดงหัวข้อและฟอร์มเข้าสู่ระบบครบถ้วน', async ({ page }) => {
    await expect(page.getByText('Libraries Admin')).toBeVisible();
    await expect(page.getByPlaceholder('รหัส 6 หลัก')).toBeVisible();
    await expect(page.getByPlaceholder('รหัสผ่าน 13 หลัก')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible();
  });

  // เคสที่ 2: กรอกข้อมูลไม่ครบตามรูปแบบ ต้องขึ้นข้อความแจ้งเตือน
  test('กรอกรหัสไม่ครบ ต้องแสดงข้อความแจ้งเตือนความถูกต้อง', async ({ page }) => {
    await page.getByPlaceholder('รหัส 6 หลัก').fill('123');
    await page.getByPlaceholder('รหัสผ่าน 13 หลัก').fill('123');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    await expect(
      page.getByText('กรุณากรอกรหัส Admin (6 หลัก) และรหัสผ่าน (13 หลัก) ให้ถูกต้อง')
    ).toBeVisible();
  });

  // เคสที่ 3: กรอกรหัสถูกต้อง ต้องเข้าสู่ระบบได้สำเร็จ
  test('กรอกรหัสถูกต้อง ต้องเข้าสู่ระบบสำเร็จ', async ({ page }) => {
    await page.getByPlaceholder('รหัส 6 หลัก').fill('100001');
    await page.getByPlaceholder('รหัสผ่าน 13 หลัก').fill('1309900000001');
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

    // เมื่อเข้าสู่ระบบสำเร็จ ฟอร์มรหัส 6 หลักของหน้า Login จะหายไปและเข้าสู่หน้า Dashboard
    await expect(page.getByPlaceholder('รหัส 6 หลัก')).toBeHidden();
  });
});
