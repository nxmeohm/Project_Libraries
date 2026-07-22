import { Info, Lock, User } from "lucide-react";
import { useState } from "react";

/**
 * AdminLoginScreen
 * หน้า Login สำหรับเจ้าหน้าที่บรรณสาร (Admin)
 * - รหัส Admin: ตัวเลข 6 หลัก
 * - รหัสผ่าน: ตัวเลข 13 หลัก
 *
 * Props:
 *   onLoginSuccess?: (adminCode: string) => void   เรียกเมื่อกรอกข้อมูลถูกต้องครบ
 */
export default function AdminLoginScreen({ onLoginSuccess = () => { } }) {
    const [adminCode, setAdminCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        const codeValid = /^\d{6}$/.test(adminCode);
        const passValid = /^\d{13}$/.test(password);
        if (!codeValid || !passValid) {
            setError(true);
            setErrorMessage("กรุณากรอกรหัส Admin (6 หลัก) และรหัสผ่าน (13 หลัก) ให้ถูกต้อง");
            return;
        }

        setError(false);
        setErrorMessage("");
        setIsLoading(true);

        try {
            const response = await fetch("http://localhost:5000/api/auth/admin-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adminCode, password })
            });
            const data = await response.json();

            if (data.success) {
                // ส่งข้อมูลผู้ใช้งานกลับไปที่ App.jsx (เผื่อเอาไปใช้ต่อ)
                onLoginSuccess(data.data);
            } else {
                setError(true);
                setErrorMessage(data.message || "การเข้าสู่ระบบล้มเหลว");
            }
        } catch (err) {
            setError(true);
            setErrorMessage("ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้ (API Error)");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#3D2B56] p-6">
            <div className="w-full max-w-[400px]">
                {/* Brand */}
                <div className="flex flex-col items-center text-center mb-7 text-white">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center mb-4">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                            <path d="M4 5.5C4 4.67 4.67 4 5.5 4H11V19H5.5C4.67 19 4 18.33 4 17.5V5.5Z" fill="white" fillOpacity="0.9" />
                            <path d="M13 4H18.5C19.33 4 20 4.67 20 5.5V17.5C20 18.33 19.33 19 18.5 19H13V4Z" fill="white" fillOpacity="0.6" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold mb-1">Libraries Admin</h1>
                    <p className="text-sm text-purple-200">เข้าสู่ระบบสำหรับเจ้าหน้าที่บรรณสาร</p>
                </div>

                {/* Card */}
                <form onSubmit={handleLogin} className="bg-white rounded-3xl p-7 shadow-2xl">
                    <div className="mb-4">
                        <label className="block text-[12.5px] font-semibold text-purple-800 mb-1.5">รหัส Admin</label>
                        <div className="relative">
                            <User size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-500" />
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={adminCode}
                                onChange={(e) => setAdminCode(e.target.value.replace(/\D/g, ""))}
                                placeholder="รหัส 6 หลัก"
                                className="w-full pl-10 pr-3.5 py-3 text-[14.5px] tracking-wider border border-purple-100 bg-purple-50 rounded-xl outline-none focus:border-purple-500 focus:bg-white transition"
                            />
                        </div>
                    </div>

                    <div className="mb-1">
                        <label className="block text-[12.5px] font-semibold text-purple-800 mb-1.5">รหัสผ่าน</label>
                        <div className="relative">
                            <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-500" />
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={13}
                                value={password}
                                onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
                                placeholder="รหัสผ่าน 13 หลัก"
                                className="w-full pl-10 pr-3.5 py-3 text-[14.5px] tracking-wider border border-purple-100 bg-purple-50 rounded-xl outline-none focus:border-purple-500 focus:bg-white transition"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-red-500 text-[12.5px] font-semibold mt-3 mb-1">
                            {errorMessage}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full mt-4 rounded-xl py-3.5 bg-gradient-to-br from-purple-700 to-purple-900 text-white font-semibold text-[14.5px] shadow-lg shadow-purple-900/30 transition ${isLoading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[.98]'}`}
                    >
                        {isLoading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
                    </button>

                    <div className="flex gap-2.5 items-start mt-4 p-3 bg-purple-50 rounded-xl">
                        <Info size={15} className="shrink-0 mt-0.5 text-purple-400" />
                        <span className="text-[11.5px] text-slate-500 leading-relaxed">
                            สำหรับเจ้าหน้าที่บรรณสารที่ได้รับสิทธิ์เท่านั้น หากลืมรหัสผ่านติดต่อผู้ดูแลระบบส่วนกลาง
                        </span>
                    </div>
                </form>
            </div>
        </div>
    );
}