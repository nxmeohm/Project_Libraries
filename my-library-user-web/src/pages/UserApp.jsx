import {
    Home, Search, ShoppingCart, ClipboardList, Bell, LogOut, User, Package,
    ChevronRight, Clock, AlertCircle, Info, X, Trash2, CheckCircle, BookOpen,
    Calendar, ChevronLeft, Megaphone
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:5000/api";
const IMG_BASE = "http://localhost/";

/* ============================================================
   Nav items
   ============================================================ */
const NAV_ITEMS = [
    { key: "dashboard", label: "หน้าหลัก", icon: Home },
    { key: "search", label: "ค้นหาอุปกรณ์", icon: Search },
    { key: "cart", label: "ตะกร้ายืม", icon: ShoppingCart },
    { key: "status", label: "รายการของฉัน", icon: ClipboardList },
    { key: "notifications", label: "แจ้งเตือน", icon: Bell },
];

const CATEGORIES = [
    "ทั้งหมด", "หูฟัง", "iPad", "ปลั๊กไฟพ่วง", "ปากกาแท็บเล็ต", "เม้าส์",
    "สายเชื่อมต่อ", "CyberDict", "เครื่องคิดเลข", "สายชาร์จโทรศัพท์",
    "โคมไฟ", "ปากกาแปลคำศัพท์", "iPod", "เสื่อพับ", "กระเป๋าใส่หนังสือ"
];

const STATUS_MAP = {
    pending: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-700" },
    borrowed: { label: "กำลังยืม", cls: "bg-purple-100 text-purple-700" },
    returned: { label: "คืนแล้ว", cls: "bg-green-100 text-green-700" },
    overdue: { label: "เลยกำหนด", cls: "bg-red-100 text-red-700" },
    rejected: { label: "ยกเลิก", cls: "bg-slate-100 text-slate-600" },
    damaged_lost: { label: "สูญหาย/ชำรุด", cls: "bg-orange-100 text-orange-700" },
    fine_paid: { label: "ชำระค่าปรับแล้ว", cls: "bg-teal-100 text-teal-700" },
};

/* ============================================================
   Helpers
   ============================================================ */
const formatThaiDate = (dateString) => {
    if (!dateString) return "-";
    const d = new Date(dateString);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
};

const daysBetween = (d1, d2) => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((d2 - d1) / oneDay);
};

const matchCategory = (name, cat) => {
    const n = (name || '').toLowerCase();
    if (cat === 'ทั้งหมด') return true;
    if (cat === 'iPad') return n.includes('ipad');
    if (cat === 'หูฟัง') return n.includes('หูฟัง') || n.includes('headphone');
    if (cat === 'ปลั๊กไฟพ่วง') return n.includes('ปลั๊ก') || n.includes('usb + type c') || n.includes('toshimo');
    if (cat === 'ปากกาแท็บเล็ต') return n.includes('ปากกาแท็บเล็ต') || n.includes('stylus') || n.includes('pencil');
    if (cat === 'เม้าส์') return n.includes('เม้าส์') || n.includes('mouse');
    if (cat === 'สายเชื่อมต่อ') return n.includes('สายเชื่อมต่อ') || n.includes('cable') || n.includes('hdmi') || n.includes('usb-c') || n.includes('type c');
    if (cat === 'CyberDict') return n.includes('cyberdict') || n.includes('talking dict') || n.includes('read');
    if (cat === 'เครื่องคิดเลข') return n.includes('เครื่องคิดเลข') || n.includes('calculator');
    if (cat === 'สายชาร์จโทรศัพท์') return n.includes('สายชาร์จ') || n.includes('lightning') || n.includes('adapter');
    if (cat === 'โคมไฟ') return n.includes('โคมไฟ');
    if (cat === 'ปากกาแปลคำศัพท์') return n.includes('ปากกาแปลคำศัพท์') || n.includes('quicktionary') || n.includes('scan and translate');
    if (cat === 'iPod') return n.includes('ipod');
    if (cat === 'เสื่อพับ') return n.includes('เสื่อพับ') || n.includes('เสื่อ');
    if (cat === 'กระเป๋าใส่หนังสือ') return n.includes('กระเป๋า');
    return n.includes(cat.toLowerCase());
};

const getItemStatus = (item) => {
    const today = new Date();
    if (item.status === 'fine_paid') return { label: 'ชำระค่าปรับแล้ว', type: 'fine_paid', fine: 0, overdueDays: 0, progress: 100, dueDate: new Date() };
    if (item.status === 'damaged_lost') return { label: 'รอชำระค่าปรับ', type: 'damaged_lost', fine: 0, overdueDays: 0, progress: 100, dueDate: new Date() };
    if (item.status === 'returned') {
        const borrowDate = new Date(item.borrow_date);
        const returnDate = item.return_date ? new Date(item.return_date) : null;
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + (item.borrow_days || 7));
        if (returnDate && returnDate > dueDate) {
            const overdueDays = daysBetween(dueDate, returnDate);
            return { label: `คืนช้า ${overdueDays} วัน`, type: 'returned-late', fine: 0, overdueDays, progress: 100, dueDate };
        }
        return { label: 'คืนแล้ว', type: 'returned', fine: 0, overdueDays: 0, progress: 100, dueDate };
    }
    const borrowDate = new Date(item.borrow_date);
    const dueDate = new Date(borrowDate);
    const borrowDays = item.borrow_days || 7;
    dueDate.setDate(dueDate.getDate() + borrowDays);
    const daysLeft = daysBetween(today, dueDate);
    const elapsed = daysBetween(borrowDate, today);
    const progress = Math.min(100, Math.max(0, (elapsed / borrowDays) * 100));
    if (daysLeft < 0) {
        const overdueDays = Math.abs(daysLeft);
        return { label: `เกิน ${overdueDays} วัน`, type: 'overdue', fine: overdueDays * 20, overdueDays, progress: 100, dueDate };
    }
    if (daysLeft === 0) return { label: 'ครบกำหนดวันนี้', type: 'due-today', fine: 0, overdueDays: 0, progress, dueDate };
    if (daysLeft <= 2) return { label: `อีก ${daysLeft} วัน`, type: 'near-due', fine: 0, overdueDays: 0, progress, dueDate };
    return { label: `อีก ${daysLeft} วัน`, type: 'active', fine: 0, overdueDays: 0, progress, dueDate };
};

const getProgressColor = (type) => {
    switch (type) {
        case 'overdue': case 'returned-late': return 'bg-red-500';
        case 'due-today': return 'bg-orange-500';
        case 'near-due': return 'bg-amber-500';
        case 'returned': return 'bg-green-500';
        case 'fine_paid': return 'bg-teal-500';
        case 'damaged_lost': return 'bg-orange-500';
        default: return 'bg-purple-500';
    }
};

const getBadgeStyle = (type) => {
    switch (type) {
        case 'overdue': case 'returned-late': return 'bg-red-50 text-red-600 border-red-100';
        case 'due-today': return 'bg-orange-50 text-orange-600 border-orange-100';
        case 'near-due': return 'bg-amber-50 text-amber-600 border-amber-100';
        case 'returned': return 'bg-green-50 text-green-600 border-green-100';
        case 'fine_paid': return 'bg-teal-50 text-teal-600 border-teal-100';
        case 'damaged_lost': return 'bg-orange-50 text-orange-600 border-orange-100';
        default: return 'bg-blue-50 text-blue-600 border-blue-100';
    }
};

/* ============================================================
   Component
   ============================================================ */
export default function UserApp({ studentId, onLogout }) {
    const [currentPage, setCurrentPage] = useState("dashboard");

    // Data states
    const [student, setStudent] = useState(null);
    const [equipments, setEquipments] = useState([]);
    const [borrowedItems, setBorrowedItems] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Search states
    const [searchText, setSearchText] = useState("");
    const [activeCategory, setActiveCategory] = useState("ทั้งหมด");

    // Cart states
    const [cartItems, setCartItems] = useState([]);
    const [checkoutSuccess, setCheckoutSuccess] = useState(false);
    const [transactionId, setTransactionId] = useState("");

    // Detail modal
    const [detailItem, setDetailItem] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // Status filter
    const [statusTab, setStatusTab] = useState("ทั้งหมด");

    // Fetch student + equipments on mount
    useEffect(() => {
        if (studentId) {
            fetch(`${API_BASE}/get_student.php?id=${studentId}`).then(r => r.json()).then(setStudent).catch(console.error);
        }
    }, [studentId]);

    useEffect(() => {
        if (currentPage === "dashboard" || currentPage === "search") {
            fetch(`${API_BASE}/get_equipments.php`).then(r => r.json()).then(setEquipments).catch(console.error);
        }
        if (currentPage === "dashboard" || currentPage === "status") {
            fetchBorrowed();
        }
        if (currentPage === "notifications") {
            fetchNotifications();
        }
    }, [currentPage]);

    const fetchBorrowed = () => {
        if (!studentId) return;
        fetch(`${API_BASE}/get_borrowed.php?student_id=${studentId}`)
            .then(r => r.json())
            .then(result => { if (result.success) setBorrowedItems(result.data); })
            .catch(console.error);
    };

    const fetchNotifications = async () => {
        try {
            const res = await fetch(`${API_BASE}/get_notifications.php?student_id=${studentId}&type=announcement`);
            const data = await res.json();
            if (data.success) setNotifications(data.data);
        } catch (e) { console.error(e); }
    };

    // Cart functions
    const addToCart = (item) => {
        if (cartItems.find(c => c.equipment_id === item.equipment_id)) return false;
        if (cartItems.length >= 5) return false;
        setCartItems(prev => [...prev, item]);
        return true;
    };

    const removeFromCart = (equipmentId) => {
        setCartItems(prev => prev.filter(c => c.equipment_id !== equipmentId));
    };

    // Open detail
    const openDetail = async (equipmentId) => {
        setIsDetailOpen(true);
        setIsDetailLoading(true);
        try {
            const res = await fetch(`${API_BASE}/get_detail.php?id=${equipmentId}`);
            const data = await res.json();
            setDetailItem(data);
        } catch (e) { console.error(e); }
        setIsDetailLoading(false);
    };

    // Checkout
    const handleCheckout = async () => {
        if (cartItems.length === 0) return;
        setIsLoading(true);
        let successItems = [];
        for (const item of cartItems) {
            try {
                const res = await fetch(`${API_BASE}/checkout.php`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ student_id: studentId, equipment_id: item.equipment_id })
                });
                const result = await res.json();
                if (result.success) successItems.push(item);
            } catch (e) { console.error(e); }
        }
        if (successItems.length > 0) {
            const txId = 'LB' + Math.floor(100000 + Math.random() * 900000);
            setTransactionId(txId);
            setCheckoutSuccess(true);
            setCartItems([]);
        }
        setIsLoading(false);
    };

    // Cancel borrow request
    const handleCancelRequest = async (id) => {
        if (!confirm("คุณต้องการยกเลิกคำขอยืมอุปกรณ์นี้ใช่หรือไม่?")) return;
        try {
            const res = await fetch(`${API_BASE}/cancel_request.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.success) {
                fetchBorrowed();
                alert("ยกเลิกรายการเรียบร้อยแล้ว");
            }
        } catch (e) { console.error(e); }
    };

    // Derived data
    const activeItems = borrowedItems.filter(i => i.status === 'borrowed');
    const returnedCount = borrowedItems.filter(i => i.status === 'returned').length;

    // Status filtered items
    const filteredStatusItems = borrowedItems.filter(item => {
        if (item.status === 'rejected') return false;
        if (statusTab === 'ทั้งหมด') return true;
        if (statusTab === 'กำลังยืม') return item.status === 'borrowed';
        if (statusTab === 'เกินกำหนด') {
            const s = getItemStatus(item);
            return s.type === 'overdue' || s.type === 'returned-late' || s.type === 'damaged_lost';
        }
        if (statusTab === 'คืนแล้ว') return item.status === 'returned' || item.status === 'fine_paid';
        return true;
    });

    const totalFine = borrowedItems.reduce((sum, item) => sum + getItemStatus(item).fine, 0);

    // Search filter
    const filteredEquipments = equipments.filter(item => {
        const matchCat = matchCategory(item.name, activeCategory);
        const matchSearch = (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
            (item.kit_code || '').toLowerCase().includes(searchText.toLowerCase());
        return matchCat && matchSearch;
    });

    const badgeCount = (key) => {
        if (key === "cart") return cartItems.length || null;
        return null;
    };

    return (
        <div className="min-h-screen bg-[#F9F8FD] flex">
            {/* ================= SIDEBAR ================= */}
            <div className="w-[250px] shrink-0 bg-[#3D2B56] text-white p-5 flex flex-col sticky top-0 h-screen">
                <div className="flex items-center gap-3 px-1 pt-1 pb-7">
                    <div className="w-[38px] h-[38px] rounded-[12px] bg-white/15 flex items-center justify-center shrink-0">
                        <BookOpen size={18} className="text-white" />
                    </div>
                    <div>
                        <div className="font-bold text-[15px] leading-tight">Libraries</div>
                        <div className="text-[11px] text-purple-200 leading-tight mt-0.5">ระบบยืมคืนอุปกรณ์</div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col gap-1.5">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const active = currentPage === item.key;
                        const count = badgeCount(item.key);
                        return (
                            <button
                                key={item.key}
                                onClick={() => {
                                    setCurrentPage(item.key);
                                    if (item.key !== "cart") setCheckoutSuccess(false);
                                }}
                                className={`flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-[13.5px] font-medium transition-all ${active ? 'bg-white/15 text-white shadow-lg shadow-black/10' : 'text-purple-200 hover:bg-white/8 hover:text-white'}`}
                            >
                                <Icon size={18} />
                                <span className="flex-1 text-left">{item.label}</span>
                                {count && (
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* User info */}
                <div className="border-t border-white/10 pt-4 mt-4">
                    <div className="flex items-center gap-3 px-1 mb-3">
                        <div className="w-[38px] h-[38px] rounded-full bg-white/15 flex items-center justify-center overflow-hidden shrink-0">
                            {student?.student_img ? (
                                <img src={`${IMG_BASE}${student.student_img}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <User size={16} />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-semibold truncate">{student?.name_th || 'กำลังโหลด...'}</div>
                            <div className="text-[10.5px] text-purple-200 truncate">{studentId}</div>
                        </div>
                    </div>
                    <button onClick={onLogout} className="flex items-center gap-2 w-full px-3.5 py-2.5 rounded-xl text-[12.5px] text-purple-200 hover:bg-white/10 hover:text-white transition">
                        <LogOut size={15} />
                        ออกจากระบบ
                    </button>
                </div>
            </div>

            {/* ================= MAIN CONTENT ================= */}
            <div className="flex-1 overflow-y-auto">
                {/* ===== DASHBOARD ===== */}
                {currentPage === "dashboard" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-slate-800">ข้อมูลนักศึกษา</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">ยินดีต้อนรับเข้าสู่ระบบยืม-คืนอุปกรณ์ห้องสมุด</p>
                        </div>
                        <div className="p-8 pt-6 space-y-6">
                            {/* Profile Card */}
                            <div className="bg-[#3D2B56] rounded-3xl p-6 text-white shadow-lg shadow-[#3D2B56]/20">
                                <div className="flex items-center gap-5 mb-5">
                                    <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                        {student?.student_img ? (
                                            <img src={`${IMG_BASE}${student.student_img}`} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <User size={32} className="text-white/60" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">{student?.name_th || 'กำลังโหลด...'}</h2>
                                        <p className="text-purple-200 text-[13px] mt-0.5">รหัสนศ. <span className="font-bold">{student?.student_id || ''}</span></p>
                                        <p className="text-purple-200 text-[13px]">สาขาวิชา <span className="font-bold">{student?.department || ''}</span></p>
                                        <span className="inline-block mt-2 px-3 py-1 bg-white/20 rounded-full text-[11px] font-bold">
                                            {student?.education_status === 'active' ? 'กำลังศึกษา' : (student?.education_status || '')}
                                        </span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { n: activeItems.length, l: "กำลังยืม" },
                                        { n: returnedCount, l: "คืนแล้ว" },
                                        { n: borrowedItems.length, l: "เคยยืมทั้งหมด" },
                                    ].map((s, i) => (
                                        <div key={i} className="bg-white/10 border border-white/15 rounded-2xl py-4 text-center">
                                            <div className="text-2xl font-bold">{s.n}</div>
                                            <div className="text-purple-200 text-[12px] mt-1">{s.l}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Alert — near due */}
                            {activeItems.some(item => {
                                const s = getItemStatus(item);
                                return s.type === 'overdue' || s.type === 'near-due' || s.type === 'due-today';
                            }) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
                                    <AlertCircle size={22} className="text-amber-600 shrink-0" />
                                    <div className="flex-1">
                                        <p className="font-bold text-[14px] text-slate-800">มีอุปกรณ์ใกล้ครบกำหนดคืน</p>
                                        <p className="text-[12.5px] text-slate-500">กรุณาตรวจสอบรายการของคุณ</p>
                                    </div>
                                    <button onClick={() => setCurrentPage("status")} className="text-[13px] font-bold text-[#3D2B56] hover:underline">ดูเลย</button>
                                </div>
                            )}

                            {/* Recommended Equipment */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[16px] font-bold text-slate-800">อุปกรณ์แนะนำสำหรับคุณ</h3>
                                    <button onClick={() => setCurrentPage("search")} className="text-[13px] font-bold text-purple-600 hover:underline">ดูทั้งหมด</button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {equipments.slice(0, 5).map(item => (
                                        <button key={item.equipment_id} onClick={() => openDetail(item.equipment_id)}
                                            className="bg-white border border-purple-100 rounded-2xl p-4 text-center hover:shadow-md hover:border-purple-200 transition group">
                                            <div className="w-16 h-12 mx-auto bg-purple-50 rounded-xl flex items-center justify-center mb-3 overflow-hidden">
                                                {item.equipment_img ? (
                                                    <img src={`${IMG_BASE}${item.equipment_img.replace(/\.jpeg$/i, '.jpg')}`} alt="" className="w-10 h-10 object-contain" />
                                                ) : (
                                                    <Package size={24} className="text-purple-400" />
                                                )}
                                            </div>
                                            <p className="text-[13px] font-bold text-slate-700 line-clamp-2 h-[40px]">{item.name}</p>
                                            <p className="text-[12px] font-bold text-green-600 mt-2">เหลือ {item.available_quantity ?? item.total_quantity} ชิ้น</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Currently Borrowing */}
                            {activeItems.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-[16px] font-bold text-slate-800">รายการที่กำลังยืมอยู่</h3>
                                        <button onClick={() => setCurrentPage("status")} className="text-[13px] font-bold text-purple-600 hover:underline">ดูทั้งหมด</button>
                                    </div>
                                    <div className="space-y-3">
                                        {activeItems.slice(0, 3).map((item) => {
                                            const s = getItemStatus(item);
                                            return (
                                                <div key={item.id} className="bg-white border border-purple-100 rounded-2xl p-4 flex items-center gap-4">
                                                    <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                                        {item.equipment_img ? (
                                                            <img src={`${IMG_BASE}${item.equipment_img.replace(/\.jpeg$/i, '.jpg')}`} alt="" className="w-7 h-7 object-contain" />
                                                        ) : (
                                                            <Package size={20} className="text-purple-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[14px] font-bold text-slate-800 truncate">{item.name || `อุปกรณ์ #${item.equipment_id}`}</p>
                                                        <p className="text-[12px] text-slate-400">กำหนดคืน {formatThaiDate(s.dueDate)}</p>
                                                    </div>
                                                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${getBadgeStyle(s.type)}`}>{s.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>

                /* ===== SEARCH ===== */
                ) : currentPage === "search" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-slate-800">อุปกรณ์อิเล็กทรอนิกส์</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">ค้นหาและเลือกอุปกรณ์ที่ต้องการยืม</p>
                        </div>
                        <div className="p-8 pt-6">
                            {/* Search bar */}
                            <div className="relative mb-5">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text" placeholder="🔍 ค้นหาชื่ออุปกรณ์ เช่น iPad, หูฟัง..."
                                    className="w-full bg-white border border-purple-100 rounded-2xl py-3.5 pl-12 pr-4 text-[14px] outline-none focus:border-purple-400 transition shadow-sm"
                                    value={searchText} onChange={e => setSearchText(e.target.value)}
                                />
                            </div>

                            {/* Category tabs */}
                            <div className="flex gap-2 flex-wrap mb-6">
                                {CATEGORIES.map(cat => (
                                    <button key={cat} onClick={() => setActiveCategory(cat)}
                                        className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${activeCategory === cat ? 'bg-[#3D2B56] text-white shadow-md' : 'bg-white border border-purple-100 text-slate-600 hover:border-purple-300'}`}>
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Equipment list */}
                            <div className="space-y-3">
                                {filteredEquipments.length > 0 ? filteredEquipments.map(item => (
                                    <button key={item.equipment_id} onClick={() => openDetail(item.equipment_id)}
                                        className="w-full bg-white border border-purple-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-md hover:border-purple-200 transition text-left group">
                                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-purple-100">
                                            {item.equipment_img ? (
                                                <img src={`${IMG_BASE}${item.equipment_img.replace(/\.jpeg$/i, '.jpg')}`} alt="" className="w-full h-full object-contain" />
                                            ) : (
                                                <Package size={22} className="text-purple-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[15px] font-bold text-slate-800">{item.name}</p>
                                            <p className="text-[12px] text-slate-400 mt-0.5">{item.usage_type || 'ทั่วไป'} · รหัส {item.kit_code || '-'} · เหลือ {item.available_quantity ?? item.total_quantity}/{item.total_quantity} ชิ้น</p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'ใช้งานได้' ? 'bg-green-100 text-green-700' : item.status === 'กำลังซ่อมแซม' ? 'bg-orange-100 text-orange-700' : item.status === 'งดใช้ชั่วคราว' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{item.status || 'ใช้งานได้'}</span>
                                                <span className="text-[11px] font-bold text-purple-600">ราคา {item.price} ฿</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300 group-hover:text-purple-400 transition" />
                                    </button>
                                )) : (
                                    <div className="text-center py-12 text-slate-400">ไม่พบอุปกรณ์ที่ค้นหา</div>
                                )}
                            </div>
                        </div>
                    </>

                /* ===== CART ===== */
                ) : currentPage === "cart" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-slate-800">ตะกร้ายืมอุปกรณ์</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">ตรวจสอบรายการก่อนยืนยันการยืม</p>
                        </div>
                        <div className="p-8 pt-6 space-y-6">
                            {checkoutSuccess ? (
                                /* Success Receipt */
                                <div className="bg-white border border-green-200 rounded-3xl p-8 text-center max-w-lg mx-auto shadow-sm">
                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} className="text-green-600" />
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-800 mb-1">ยืนยันยืมอุปกรณ์สำเร็จ!</h2>
                                    <p className="text-slate-500 text-[13px] mb-4">รายการของคุณอยู่ในระบบแล้ว รอเจ้าหน้าที่อนุมัติ</p>
                                    <div className="bg-slate-50 rounded-2xl p-4 mb-5">
                                        <p className="text-[12px] text-slate-400">Transaction ID</p>
                                        <p className="text-lg font-bold text-[#3D2B56] font-mono">{transactionId}</p>
                                    </div>
                                    <div className="flex gap-3 justify-center">
                                        <button onClick={() => { setCheckoutSuccess(false); setCurrentPage("status"); }}
                                            className="px-5 py-2.5 bg-[#3D2B56] text-white rounded-xl text-[13px] font-bold hover:bg-[#2d1f40] transition">
                                            ดูรายการของฉัน
                                        </button>
                                        <button onClick={() => { setCheckoutSuccess(false); setCurrentPage("dashboard"); }}
                                            className="px-5 py-2.5 bg-white border border-purple-100 text-slate-600 rounded-xl text-[13px] font-bold hover:bg-slate-50 transition">
                                            กลับหน้าหลัก
                                        </button>
                                    </div>
                                </div>
                            ) : cartItems.length === 0 ? (
                                <div className="text-center py-16">
                                    <ShoppingCart size={48} className="mx-auto text-purple-200 mb-4" />
                                    <p className="text-slate-500 font-semibold mb-2">ตะกร้าว่างเปล่า</p>
                                    <p className="text-[13px] text-slate-400 mb-4">เลือกอุปกรณ์ที่ต้องการยืมจากหน้าค้นหา</p>
                                    <button onClick={() => setCurrentPage("search")} className="px-5 py-2.5 bg-[#3D2B56] text-white rounded-xl text-[13px] font-bold hover:bg-[#2d1f40] transition">
                                        ค้นหาอุปกรณ์
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-white border border-purple-100 rounded-3xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 border-b border-purple-50 bg-purple-50/50">
                                            <h3 className="font-bold text-[15px] text-slate-700">รายการที่เลือก ({cartItems.length}/5)</h3>
                                        </div>
                                        <div className="divide-y divide-purple-50">
                                            {cartItems.map(item => (
                                                <div key={item.equipment_id} className="px-6 py-4 flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                                        {item.equipment_img ? (
                                                            <img src={`${IMG_BASE}${item.equipment_img.replace(/\.jpeg$/i, '.jpg')}`} alt="" className="w-8 h-8 object-contain" />
                                                        ) : (
                                                            <Package size={20} className="text-purple-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[14px] font-bold text-slate-700 truncate">{item.name}</p>
                                                        <p className="text-[12px] text-slate-400">รหัส {item.kit_code || '-'} · ราคา {item.price} ฿</p>
                                                    </div>
                                                    <button onClick={() => removeFromCart(item.equipment_id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-500 flex items-center justify-center hover:bg-red-50 transition">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="flex gap-3 items-start p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                        <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
                                        <div className="text-[12.5px] text-slate-600 leading-relaxed">
                                            <p className="font-bold text-[#3D2B56] mb-1">ข้อกำหนดการยืม</p>
                                            <p>• ยืมได้สูงสุด 5 ชิ้น/ครั้ง • กำหนดคืนตามจำนวนวันของอุปกรณ์แต่ละชิ้น</p>
                                            <p className="text-red-500 font-bold mt-1">⚠️ หากเกินกำหนดคืนจะมีค่าปรับ วันละ 20 บาท</p>
                                        </div>
                                    </div>

                                    {/* Checkout button */}
                                    <button onClick={handleCheckout} disabled={isLoading}
                                        className={`w-full py-4 rounded-2xl bg-[#3D2B56] text-white font-bold text-[16px] shadow-lg shadow-[#3D2B56]/20 transition ${isLoading ? 'opacity-70' : 'hover:bg-[#2d1f40] active:scale-[.99]'}`}>
                                        {isLoading ? "กำลังดำเนินการ..." : `ยืนยันยืมอุปกรณ์ (${cartItems.length} ชิ้น)`}
                                    </button>
                                </>
                            )}
                        </div>
                    </>

                /* ===== STATUS ===== */
                ) : currentPage === "status" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-slate-800">รายการยืมของฉัน</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">ตรวจสอบสถานะการยืม-คืนอุปกรณ์ทั้งหมด</p>
                        </div>
                        <div className="p-8 pt-6 space-y-5">
                            {/* Filter tabs */}
                            <div className="flex gap-2 flex-wrap">
                                {['ทั้งหมด', 'กำลังยืม', 'เกินกำหนด', 'คืนแล้ว'].map(tab => (
                                    <button key={tab} onClick={() => setStatusTab(tab)}
                                        className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${statusTab === tab ? 'bg-[#3D2B56] text-white' : 'bg-white border border-purple-100 text-[#3D2B56] hover:border-purple-300'}`}>
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            {/* Fine alert */}
                            {totalFine > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
                                    <AlertCircle size={20} className="text-red-500 shrink-0" />
                                    <div>
                                        <p className="text-[13px] text-red-600 font-semibold">คุณมีค่าปรับค้างชำระ</p>
                                        <p className="text-[16px] text-red-700 font-bold">รวม {totalFine.toLocaleString()} บาท</p>
                                    </div>
                                </div>
                            )}

                            {/* Item cards */}
                            {filteredStatusItems.length > 0 ? filteredStatusItems.map(item => {
                                const s = getItemStatus(item);
                                return (
                                    <div key={item.id} className={`bg-white rounded-2xl p-5 border shadow-sm ${s.type === 'overdue' ? 'border-red-200' : 'border-purple-100'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-[15px] font-bold text-slate-800 flex-1 mr-3">{item.name || `อุปกรณ์ #${item.equipment_id}`}</p>
                                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full border whitespace-nowrap ${getBadgeStyle(s.type)}`}>{s.label}</span>
                                        </div>
                                        <p className="text-[13px] text-slate-400 mb-3">รหัส {item.equipment_id}</p>

                                        {/* Progress */}
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${getProgressColor(s.type)}`} style={{ width: `${s.progress}%` }} />
                                        </div>

                                        <div className="flex justify-between text-[12px] text-slate-500">
                                            <span>ยืมเมื่อ <span className="font-bold text-slate-700">{formatThaiDate(item.borrow_date)}</span></span>
                                            <span>กำหนดคืน <span className="font-bold text-slate-700">{formatThaiDate(s.dueDate)}</span></span>
                                        </div>

                                        {/* Cancel button */}
                                        {item.status === 'borrowed' && (
                                            <button onClick={() => handleCancelRequest(item.id)}
                                                className="mt-3 w-full py-2.5 border border-red-200 text-red-500 rounded-xl text-[13px] font-bold hover:bg-red-50 transition flex items-center justify-center gap-2">
                                                <X size={15} /> ยกเลิกรายการนี้
                                            </button>
                                        )}

                                        {/* Return date */}
                                        {item.return_date && (
                                            <div className="flex items-center gap-1.5 mt-3">
                                                <CheckCircle size={14} className={s.type === 'returned-late' ? 'text-red-500' : 'text-green-500'} />
                                                <span className={`text-[12px] font-semibold ${s.type === 'returned-late' ? 'text-red-500' : 'text-green-600'}`}>คืนเมื่อ {formatThaiDate(item.return_date)}</span>
                                            </div>
                                        )}

                                        {/* Fine */}
                                        {s.fine > 0 && (
                                            <div className="mt-3 bg-red-50 rounded-xl p-3 flex items-center gap-2">
                                                <AlertCircle size={15} className="text-red-500" />
                                                <span className="text-[12px] text-red-600">ค่าปรับ {s.overdueDays} วัน × 20 บาท = <strong>{s.fine} บาท</strong></span>
                                            </div>
                                        )}
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-12">
                                    <ClipboardList size={48} className="mx-auto text-purple-200 mb-3" />
                                    <p className="text-slate-400">ไม่มีรายการ{statusTab !== 'ทั้งหมด' ? statusTab : ''}</p>
                                </div>
                            )}

                            {/* Policy box */}
                            <div className="flex gap-3 items-start p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
                                <div className="text-[12px] text-slate-500 leading-relaxed">
                                    <p className="font-bold text-[#3D2B56] text-[13px] mb-1">ข้อกำหนดการยืม-คืน</p>
                                    <p>• วันทำการปกติ (จ-ศ): 08:30-20:00 น.</p>
                                    <p>• วันเสาร์-อาทิตย์ / วันหยุด: 09:00-17:00 น.</p>
                                    <p className="text-red-500 font-bold mt-1">⚠️ หากยืมเกินกำหนดจะมีค่าปรับ วันละ 20 บาท</p>
                                </div>
                            </div>
                        </div>
                    </>

                /* ===== NOTIFICATIONS ===== */
                ) : currentPage === "notifications" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-bold text-slate-800">แจ้งเตือนและประกาศ</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">ข่าวสารและประกาศจากระบบห้องสมุด</p>
                        </div>
                        <div className="p-8 pt-6 space-y-4">
                            {notifications.length > 0 ? notifications.map(notif => (
                                <div key={notif.id} className="bg-white border border-purple-100 rounded-2xl p-5 shadow-sm">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                                            <Megaphone size={18} className="text-purple-600" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-[14px] font-bold text-slate-800">{notif.title}</h3>
                                                <span className="text-[11px] text-slate-400">{formatThaiDate(notif.created_at)}</span>
                                            </div>
                                            <p className="text-[13px] text-slate-600 leading-relaxed">{notif.message}</p>
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-16">
                                    <Bell size={48} className="mx-auto text-purple-200 mb-3" />
                                    <p className="text-slate-400">ไม่มีการแจ้งเตือนในขณะนี้</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : null}
            </div>

            {/* ================= DETAIL MODAL ================= */}
            {isDetailOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-3xl">
                            <h3 className="text-lg font-bold text-slate-800">ข้อมูลเต็มก่อนยืม</h3>
                            <button onClick={() => { setIsDetailOpen(false); setDetailItem(null); }} className="p-2 hover:bg-slate-100 rounded-full transition">
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {isDetailLoading || !detailItem ? (
                            <div className="p-12 text-center text-slate-400">กำลังโหลดข้อมูล...</div>
                        ) : (
                            <div className="p-6 space-y-5">
                                {/* Image */}
                                <div className="w-full h-[200px] bg-slate-50 rounded-2xl flex items-center justify-center overflow-hidden">
                                    {detailItem.equipment_img ? (
                                        <img src={`${IMG_BASE}${detailItem.equipment_img.replace(/\.jpeg$/i, '.jpg')}`} alt="" className="max-h-full object-contain" />
                                    ) : (
                                        <Package size={64} className="text-purple-300" />
                                    )}
                                </div>

                                <h2 className="text-xl font-bold text-slate-800">{detailItem.name}</h2>
                                <p className="text-[13px] text-slate-500">รหัสครุภัณฑ์ {detailItem.kit_code}</p>

                                <span className="inline-block bg-purple-50 border border-purple-100 text-purple-700 text-[13px] font-medium px-3 py-1 rounded-full">{detailItem.usage_type || 'ทั่วไป'}</span>

                                {/* Stats */}
                                <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-2xl p-5">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-[#3D2B56]">{detailItem.available_quantity ?? detailItem.total_quantity}</p>
                                        <p className="text-[13px] text-slate-500">พร้อมให้ยืม</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-[#3D2B56]">{detailItem.total_quantity || 0}</p>
                                        <p className="text-[13px] text-slate-500">มีทั้งหมด</p>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <h4 className="font-bold text-slate-800 mb-2">รายละเอียด</h4>
                                    <p className="text-[14px] text-slate-600 leading-relaxed">{detailItem.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                                </div>

                                <div className="flex gap-3 items-start p-3.5 bg-purple-50 rounded-xl">
                                    <Info size={16} className="text-purple-600 shrink-0 mt-0.5" />
                                    <p className="text-[12px] text-slate-600 leading-relaxed">นักศึกษา 1 คน ยืมอุปกรณ์ชิ้นนี้ได้สูงสุด 1 ชิ้นต่อครั้ง กรุณาคืนตรงเวลาเพื่อให้ผู้อื่นได้ใช้งานต่อ</p>
                                </div>

                                {/* Add to cart button */}
                                {cartItems.find(c => c.equipment_id === detailItem.equipment_id) ? (
                                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
                                        <CheckCircle size={20} className="text-green-600" />
                                        <p className="text-[14px] text-green-700 font-semibold">อุปกรณ์นี้อยู่ในตะกร้าแล้ว</p>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (detailItem.status && detailItem.status !== 'ใช้งานได้') {
                                                alert(`อุปกรณ์นี้ไม่อยู่ในสถานะพร้อมใช้งาน (${detailItem.status})`);
                                                return;
                                            }
                                            const ok = addToCart(detailItem);
                                            if (!ok) alert("ไม่สามารถเพิ่มได้ (ตะกร้าเต็ม หรือ มีอยู่แล้ว)");
                                        }}
                                        disabled={detailItem.status && detailItem.status !== 'ใช้งานได้'}
                                        className={`w-full py-4 rounded-2xl text-white font-bold text-[15px] transition ${detailItem.status && detailItem.status !== 'ใช้งานได้' ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#3D2B56] shadow-lg shadow-[#3D2B56]/20 hover:bg-[#2d1f40] active:scale-[.99]'}`}
                                    >
                                        {detailItem.status && detailItem.status !== 'ใช้งานได้' ? `งดยืมชั่วคราว (${detailItem.status})` : 'ยืมอุปกรณ์นี้'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
