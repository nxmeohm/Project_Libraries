import { CreditCard, KeyRound, Info, BookOpen } from "lucide-react";
import { useState } from "react";

export default function UserLoginScreen({ onLoginSuccess = () => { } }) {
    const [studentId, setStudentId] = useState("");
    const [citizenId, setCitizenId] = useState("");
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        const studentIdRegex = /^B\d{7}$/;
        if (!studentIdRegex.test(studentId)) {
            setError(true);
            setErrorMessage("รหัสนักศึกษาต้องขึ้นต้นด้วยอักษร B และตามด้วยตัวเลข 7 หลัก เช่น B1234567");
            return;
        }
        if (citizenId.length !== 13) {
            setError(true);
            setErrorMessage("เลขบัตรประชาชนต้องมี 13 หลัก");
            return;
        }

        setError(false);
        setErrorMessage("");
        setIsLoading(true);

        try {
            const API_BASE = `http://${window.location.hostname}:5000/api`;
            const response = await fetch(`${API_BASE}/auth/user-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ studentId, citizenId })
            });
            const data = await response.json();

            if (data.success) {
                onLoginSuccess(studentId, data.token);
            } else {
                setError(true);
                setErrorMessage(data.message || "รหัสนักศึกษาหรือเลขบัตรประชาชนไม่ถูกต้อง");
            }
        } catch (err) {
            setError(true);
            setErrorMessage("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#4C337D] p-6 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-[-120px] right-[-80px] w-[300px] h-[300px] bg-white/5 rounded-full blur-2xl" />
            <div className="absolute bottom-[-100px] left-[-60px] w-[250px] h-[250px] bg-purple-400/10 rounded-full blur-3xl" />

            <div className="w-full max-w-[420px] relative z-10">
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-8 text-white">
                    <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center mb-5 backdrop-blur-sm">
                        <BookOpen size={28} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Libraries</h1>
                    <p className="text-purple-200 text-[15px] leading-relaxed">ระบบยืม–คืนอุปกรณ์บรรณสาร สำหรับนักศึกษา</p>
                    <p className="text-purple-300/80 text-[14px] mt-1">กรอกข้อมูลเพื่อยืนยันตัวตนก่อนเข้าใช้งาน</p>
                </div>

                {/* Form Card */}
                <form onSubmit={handleLogin} className="bg-white rounded-[28px] p-8 shadow-2xl shadow-black/20">
                    {/* Student ID */}
                    <div className="mb-5">
                        <label className="block text-[13.5px] font-bold text-[#4C337D] mb-2">รหัสนักศึกษา</label>
                        <div className="relative">
                            <CreditCard size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
                            <input
                                type="text"
                                maxLength={8}
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                                placeholder="เช่น B1234567"
                                className="w-full pl-12 pr-4 py-3.5 text-[15px] tracking-wide border border-purple-100 bg-[#F8F6FC] rounded-2xl outline-none focus:border-purple-500 focus:bg-white transition"
                            />
                        </div>
                        <p className="text-[12px] text-slate-400 mt-1.5 ml-1">ขึ้นต้นด้วยอักษร B ตามด้วยตัวเลข 7 หลัก</p>
                    </div>

                    {/* Citizen ID */}
                    <div className="mb-2">
                        <label className="block text-[13.5px] font-bold text-[#4C337D] mb-2">เลขบัตรประชาชน</label>
                        <div className="relative">
                            <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
                            <input
                                type="password"
                                inputMode="numeric"
                                maxLength={13}
                                value={citizenId}
                                onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, ""))}
                                placeholder="เลข 13 หลัก"
                                className="w-full pl-12 pr-4 py-3.5 text-[15px] tracking-wider border border-purple-100 bg-[#F8F6FC] rounded-2xl outline-none focus:border-purple-500 focus:bg-white transition"
                            />
                        </div>
                        <p className="text-[12px] text-slate-400 mt-1.5 ml-1">ใช้ยืนยันตัวตนครั้งแรกเท่านั้น ระบบจะเข้ารหัสข้อมูลของคุณ</p>
                    </div>

                    {error && (
                        <p className="text-red-500 text-[13px] font-semibold mt-3 mb-1 bg-red-50 p-3 rounded-xl border border-red-100">
                            {errorMessage}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={`w-full mt-5 rounded-2xl py-4 bg-[#321A54] text-white font-bold text-[16px] shadow-lg shadow-[#321A54]/30 transition ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#271445] active:scale-[.98]'}`}
                    >
                        {isLoading ? "กำลังตรวจสอบ..." : "ยืนยันตัวตน"}
                    </button>

                    {/* Info Box */}
                    <div className="flex gap-3 items-start mt-5 p-4 bg-[#F9F9FB] rounded-2xl">
                        <Info size={16} className="shrink-0 mt-0.5 text-slate-400" />
                        <span className="text-[12px] text-slate-500 leading-relaxed">
                            หากยืนยันตัวตนไม่สำเร็จ ติดต่อเจ้าหน้าที่บรรณสาร ชั้น 1 อาคารห้องสมุด
                        </span>
                    </div>
                </form>
            </div>
        </div>
    );
}
