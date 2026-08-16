import {
    Home, Search, ClipboardList, Bell, LogOut, User, Package, ShoppingCart,
    ChevronRight, ChevronDown, ChevronUp, Clock, AlertCircle, Info, X, Trash2, CheckCircle, BookOpen,
    Calendar, ChevronLeft, Megaphone, Settings, AlertTriangle, Save, Key, ShieldCheck, FileText, Lock, Timer, Users
} from "lucide-react";
import QRCode from "react-qr-code";
import { useState, useEffect, useCallback, useMemo } from "react";
import { io } from "socket.io-client";

const API_BASE = typeof window !== 'undefined' ? `http://${window.location.hostname}:5000/api` : "http://localhost:5000/api";
const IMG_BASE = typeof window !== 'undefined' ? `http://${window.location.hostname}:5000/` : "http://localhost:5000/";

/* ============================================================
   Nav items
   ============================================================ */
const NAV_ITEMS = [
    { key: "dashboard", label: "หน้าหลัก", icon: Home },
    { key: "search", label: "ค้นหาอุปกรณ์", icon: Search },
    { key: "cart", label: "ตะกร้ายืม", icon: ShoppingCart },
    { key: "queue", label: "คิวของฉัน", icon: Timer },
    { key: "status", label: "รายการของฉัน", icon: ClipboardList },
    { key: "settings", label: "ตั้งค่า", icon: Settings },
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
    today.setHours(0,0,0,0);
    
    let fine = 0;
    let overdueDays = 0;
    let progress = 0;
    let dueDate = new Date();
    
    let label = STATUS_MAP[item.status] ? STATUS_MAP[item.status].label : item.status;
    let type = item.status;

    if (item.status === 'fine_paid') {
        progress = 100;
    } else if (item.status === 'damaged_lost') {
        fine = parseFloat(item.fine_amount) || 0;
        progress = 100;
    } else if (item.status === 'rejected') {
        progress = 0;
    } else if (item.status === 'pending') {
        progress = 0;
    } else if (item.status === 'returned') {
        progress = 100;
        const borrowDate = new Date(item.borrow_date);
        const returnDate = item.return_date ? new Date(item.return_date) : null;
        dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + (item.borrow_days || 7));
        if (returnDate && returnDate > dueDate) {
            overdueDays = daysBetween(dueDate, returnDate);
            fine = parseFloat(item.fine_amount) || (overdueDays * 20);
            type = 'returned-late';
        }
    } else {
        const borrowDate = new Date(item.borrow_date);
        dueDate = new Date(borrowDate);
        const borrowDays = item.borrow_days || 7;
        dueDate.setDate(dueDate.getDate() + borrowDays);
        const daysLeft = daysBetween(today, dueDate);
        const elapsed = daysBetween(borrowDate, today);
        progress = Math.min(100, Math.max(0, (elapsed / borrowDays) * 100));
        
        if (daysLeft < 0 || item.status === 'overdue') {
            overdueDays = Math.max(1, Math.abs(daysLeft));
            fine = overdueDays * 20;
            type = 'overdue';
            label = STATUS_MAP['overdue'] ? STATUS_MAP['overdue'].label : 'เลยกำหนด';
        } else if (daysLeft === 0) {
            type = 'due-today';
        } else if (daysLeft <= 2) {
            type = 'near-due';
        } else {
            type = 'borrowed';
        }
    }

    return { label, type, fine, overdueDays, progress, dueDate };
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
        case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
        case 'returned': return 'bg-green-50 text-green-600 border-green-100';
        case 'fine_paid': return 'bg-teal-50 text-teal-600 border-teal-100';
        case 'damaged_lost': return 'bg-orange-50 text-orange-600 border-orange-100';
        case 'rejected': return 'bg-slate-50 text-slate-600 border-slate-100';
        case 'borrowed': return 'bg-purple-50 text-purple-600 border-purple-100';
        default: return 'bg-purple-50 text-purple-600 border-purple-100';
    }
};

/* ============================================================
   Toast Component
   ============================================================ */
function Toast({ message, type, onClose }) {
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-amber-500'
    };
    useEffect(() => {
        const timer = setTimeout(onClose, 3500);
        return () => clearTimeout(timer);
    }, [onClose]);
    return (
        <div className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-xl shadow-2xl text-white font-medium text-[14px] flex items-center gap-2 ${colors[type] || colors.info}`} style={{animation: 'slideIn 0.3s ease'}}>
            {type === 'success' && <CheckCircle size={18} />}
            {type === 'error' && <X size={18} />}
            <span>{message}</span>
            <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
    );
}

/* ============================================================
   authFetch Helper — ส่ง JWT Token ไปกับทุก API Request ที่ต้อง auth
   ============================================================ */
async function authFetch(url, options = {}) {
    const token = sessionStorage.getItem('user_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`, { ...options, headers });
    if (res.status === 401) {
        sessionStorage.removeItem('user_token');
        sessionStorage.removeItem('user_student_id');
        window.location.href = '/login';
        throw new Error('Session expired');
    }
    return res.json();
}

/* ============================================================
   Calendar View Component
   ============================================================ */
function CalendarView() {
    const [currentMonthDate, setCurrentMonthDate] = useState(new Date(2026, 6, 1));
    const [selectedDateObj, setSelectedDateObj] = useState(new Date(2026, 6, 17));

    const events = {
        '2026-07-27': 'exam', '2026-07-31': 'exam',
        '2026-07-28': 'holiday', '2026-07-29': 'holiday', '2026-07-30': 'holiday',
        '2026-08-03': 'exam', '2026-08-04': 'exam', '2026-08-05': 'exam', '2026-08-06': 'exam', '2026-08-07': 'exam',
        '2026-08-12': 'holiday',
        '2026-09-07': 'exam', '2026-09-08': 'exam', '2026-09-09': 'exam', '2026-09-10': 'exam', '2026-09-11': 'exam',
        '2026-09-14': 'exam', '2026-09-15': 'exam', '2026-09-16': 'exam', '2026-09-17': 'exam', '2026-09-18': 'exam',
        '2026-10-13': 'holiday', '2026-10-23': 'holiday'
    };

    const getDayInfo = (dateObj) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const eventType = events[dateStr] || (isWeekend ? 'weekend' : 'normal');

        let bg = 'transparent', dot = 'transparent';
        if (eventType === 'weekend') { bg = '#F5F3FA'; dot = '#6A5ACD'; }
        else if (eventType === 'holiday') { bg = '#FDEAEA'; dot = '#E57373'; }
        else if (eventType === 'exam') { bg = '#FEF3C7'; dot = '#F59E0B'; }
        
        return { type: eventType, bg, dot };
    };

    const getTimeDetail = (dateObj) => {
        const type = getDayInfo(dateObj).type;
        if (type === 'weekend') return { hours: '09:00 - 17:00 น.', desc: 'เวลาทำการวันเสาร์-อาทิตย์' };
        if (type === 'holiday') return { hours: '09:00 - 17:00 น.', desc: 'เวลาทำการวันหยุดนักขัตฤกษ์' };
        if (type === 'exam') return { hours: '08:30 - 00:00 น.', desc: 'เวลาทำการวันจันทร์-ศุกร์ (ช่วง 2 สัปดาห์ก่อนสอบ)' };
        return { hours: '08:30 - 20:00 น.', desc: 'เวลาทำการวันจันทร์-ศุกร์ (ปกติ)' };
    };

    const generateCalendar = (date) => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDate.getDay());
        const endDate = new Date(lastDay);
        if (endDate.getDay() !== 6) endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

        const weeks = [];
        let current = new Date(startDate);
        while (current <= endDate) {
            const week = [];
            for (let i = 0; i < 7; i++) {
                week.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }
            weeks.push(week);
        }
        return weeks;
    };

    const formatThaiDate = (d) => {
        const days = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
        const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        return `${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    };

    const formatMonthYear = (d) => {
        const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        return `${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    };

    const changeMonth = (offset) => {
        const newMonth = new Date(currentMonthDate);
        newMonth.setMonth(newMonth.getMonth() + offset);
        setCurrentMonthDate(newMonth);
    };

    const isSameDate = (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

    const calendarWeeks = generateCalendar(currentMonthDate);

    return (
        <div>
            <div className="flex justify-between items-center mb-5 px-2">
                <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition">
                    <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <h4 className="font-bold text-[16px] text-[#3D2B56]">{formatMonthYear(currentMonthDate)}</h4>
                <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition">
                    <ChevronRight size={20} className="text-slate-600" />
                </button>
            </div>
            
            <div className="mb-5">
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['อา','จ','อ','พ','พฤ','ศ','ส'].map((d, i) => (
                        <div key={i} className="text-center text-[12px] font-semibold text-slate-400">{d}</div>
                    ))}
                </div>
                {calendarWeeks.map((week, rowIndex) => (
                    <div key={rowIndex} className="grid grid-cols-7 gap-1 mb-1">
                        {week.map((dayObj, colIndex) => {
                            const isSelected = isSameDate(dayObj, selectedDateObj);
                            const isCurrentMonth = dayObj.getMonth() === currentMonthDate.getMonth();
                            const { bg, dot } = getDayInfo(dayObj);
                            
                            return (
                                <button 
                                    key={colIndex}
                                    onClick={() => setSelectedDateObj(dayObj)}
                                    className={`w-9 h-9 mx-auto rounded-xl flex flex-col items-center justify-center transition-all ${!isCurrentMonth ? 'opacity-40' : ''}`}
                                    style={{ 
                                        backgroundColor: isSelected ? '#3D2B56' : bg,
                                        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                                        boxShadow: isSelected ? '0 4px 10px rgba(61, 43, 86, 0.2)' : 'none'
                                    }}
                                >
                                    <span className={`text-[13px] font-bold ${isSelected ? 'text-white' : (isCurrentMonth ? 'text-slate-700' : 'text-slate-400')}`}>
                                        {dayObj.getDate()}
                                    </span>
                                    {!isSelected && dot !== 'transparent' && (
                                        <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: dot }}></div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl mb-5 border border-slate-100">
                <p className="text-[13px] text-slate-500 mb-1">{formatThaiDate(selectedDateObj)}</p>
                <h3 className="text-[18px] font-bold text-[#3D2B56] leading-tight mb-1">{getTimeDetail(selectedDateObj).hours}</h3>
                <p className="text-[13px] text-slate-600">{getTimeDetail(selectedDateObj).desc}</p>
            </div>

            <div className="grid grid-cols-2 gap-y-3 px-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-slate-200"></div>
                    <span className="text-[12px] text-slate-600">วันธรรมดา</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#F5F3FA]"></div>
                    <span className="text-[12px] text-slate-600">เสาร์-อาทิตย์</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#FDEAEA]"></div>
                    <span className="text-[12px] text-slate-600">วันหยุดขัตฤกษ์</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#FEF3C7]"></div>
                    <span className="text-[12px] text-slate-600">ช่วงใกล้สอบ</span>
                </div>
            </div>
        </div>
    );
}

/* ============================================================
   Notifications Helper Functions
   ============================================================ */
const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' ปีที่แล้ว';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' เดือนที่แล้ว';
    interval = seconds / 86400;
    if (interval >= 1 && interval < 2) return 'เมื่อวานนี้';
    if (interval >= 2) return Math.floor(interval) + ' วันที่แล้ว';
    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + ' ชั่วโมงที่แล้ว';
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + ' นาทีที่แล้ว';
    return 'เพิ่งสำเร็จ';
};

const getNotifIcon = (type) => {
    switch (type) {
        case 'success': return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' };
        case 'info': return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' };
        case 'warning': return { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' };
        case 'danger': return { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' };
        case 'system': return { icon: Megaphone, color: 'text-[#6A5ACD]', bg: 'bg-[#F3F0F9]' };
        default: return { icon: Bell, color: 'text-[#3D2B56]', bg: 'bg-[#F3F0F9]' };
    }
};

/* ============================================================
   Notifications & Announcements View Component
   ============================================================ */
function NotificationsView({ title, notifications, isLoading, onNotificationClick }) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-[#3D2B56] rounded-full animate-spin mb-4"></div>
                <p className="text-[14px]">กำลังโหลด...</p>
            </div>
        );
    }

    if (!notifications || notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Bell size={48} className="text-slate-200 mb-4" />
                <p className="text-[15px] font-medium">ไม่มี{title}</p>
            </div>
        );
    }

    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="p-8 pt-6 max-w-3xl mx-auto w-full">
            <h2 className="text-2xl font-bold text-[#3D2B56] mb-6">{title}</h2>
            <div className="space-y-4">
                {notifications.map((notif, index) => {
                    const { icon: Icon, color, bg } = getNotifIcon(notif.type);
                    const isExpanded = expandedId === notif.id;
                    const hasDetails = notif.desc || notif.image_url;

                    return (
                        <div key={index} className={`w-full bg-white border border-slate-100 rounded-2xl transition ${hasDetails ? 'hover:shadow-md hover:border-purple-200' : ''}`}>
                            <button 
                                onClick={() => {
                                    if (hasDetails) {
                                        setExpandedId(isExpanded ? null : notif.id);
                                    }
                                    if (onNotificationClick) onNotificationClick(notif);
                                }}
                                className={`w-full flex items-start gap-4 p-5 text-left ${hasDetails ? 'cursor-pointer group' : 'cursor-default'}`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                                    <Icon size={24} className={color} />
                                </div>
                                <div className="flex-1 pt-0.5">
                                    <h4 className="text-[15px] font-bold text-slate-800">{notif.title}</h4>
                                    {!isExpanded && notif.desc && (
                                        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed line-clamp-1">{notif.desc}</p>
                                    )}
                                    <p className="text-[11.5px] text-slate-400 mt-2">{formatTimeAgo(notif.date)}</p>
                                </div>
                                {hasDetails && (
                                    <div className="mt-4 flex items-center justify-center w-8 h-8 rounded-full transition-colors group-hover:bg-purple-50">
                                        {isExpanded ? <ChevronUp size={20} className="text-purple-600" /> : <ChevronDown size={20} className="text-slate-400 group-hover:text-purple-600" />}
                                    </div>
                                )}
                            </button>
                            {isExpanded && hasDetails && (
                                <div className="px-5 pb-5 pt-2 pl-[84px] border-t border-slate-50 animate-in slide-in-from-top-2 duration-200">
                                    {notif.desc && (
                                        <p className="text-[14px] text-slate-600 leading-relaxed whitespace-pre-wrap">{notif.desc}</p>
                                    )}
                                    {notif.image_url && (
                                        <div className="mt-4">
                                            <img src={`http://localhost:5000/${notif.image_url}`} alt="รูปประกาศ" className="max-w-full max-h-64 object-cover rounded-xl border border-slate-100 shadow-sm" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'info') => setToast({ message, type });

    // Settings states
    const [notifyDue, setNotifyDue] = useState(true);

    // Search states
    const [searchText, setSearchText] = useState("");
    const [activeCategory, setActiveCategory] = useState("ทั้งหมด");

    // Cart states
    const [cartItems, setCartItems] = useState([]);
    const [transactionId, setTransactionId] = useState("");
    const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
    const [pickupTime, setPickupTime] = useState(`${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);

    // Queue states (replaces old cart states)
    const [myQueueItems, setMyQueueItems] = useState([]);
    const [isQueueLoading, setIsQueueLoading] = useState(false);
    const [checkoutSuccess, setCheckoutSuccess] = useState(false);
    const [transactionDetails, setTransactionDetails] = useState(null);
    
    // Receipt Modal State
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    // PIN Modal State
    const [pinCode, setPinCode] = useState(localStorage.getItem('user_pin') || '');
    const [isPinVisible, setIsPinVisible] = useState(false);

    // Memoized grouped receipts
    const groupedReceipts = useMemo(() => {
        const groups = {};
        borrowedItems.forEach(item => {
            const txId = item.transaction_id || new Date(item.borrow_date).getTime().toString();
            if (!groups[txId]) {
                groups[txId] = {
                    txId: txId,
                    borrowDate: new Date(item.borrow_date),
                    status: item.status,
                    items: []
                };
            }
            groups[txId].items.push(item);
        });
        return Object.values(groups).sort((a, b) => b.borrowDate - a.borrowDate);
    }, [borrowedItems]);

    // Detail modal
    const [detailItem, setDetailItem] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    // Status filter
    const [statusTab, setStatusTab] = useState("ทั้งหมด");

    // Report Lost modal state
    const [isLostModalOpen, setIsLostModalOpen] = useState(false);
    const [lostItemTarget, setLostItemTarget] = useState(null);
    const [lostDate, setLostDate] = useState(new Date().toISOString().split('T')[0]);
    const [lostNote, setLostNote] = useState("");
    const [isSubmittingLost, setIsSubmittingLost] = useState(false);

    // Settings state
    const [settingsForm, setSettingsForm] = useState({
        name_th: "",
        name_en: "",
        email: "",
        phone_number: "",
        department: ""
    });
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState({ type: "", text: "" });
    const [settingsModal, setSettingsModal] = useState(null);

    const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);

    // Fetch student on mount
    useEffect(() => {
        if (studentId) {
            authFetch(`/get_student.php?id=${studentId}`)
                .then(data => {
                    setStudent(data);
                    if (data) {
                        setSettingsForm(prev => ({
                            ...prev,
                            name_th: data.name_th || "",
                            name_en: data.name_en || "",
                            email: data.email || "",
                            phone_number: data.phone_number || data.phone || "",
                            department: data.department || ""
                        }));
                    }
                })
                .catch(console.error);
        }
    }, [studentId]);

    useEffect(() => {
        if (currentPage === "dashboard" || currentPage === "search") {
            fetch(`${API_BASE}/get_equipments.php`).then(r => r.json()).then(setEquipments).catch(console.error);
        }
        if (currentPage === "dashboard" || currentPage === "status") {
            fetchBorrowed();
        }
        if (currentPage === "dashboard" || currentPage === "queue") {
            fetchMyQueue();
        }
        if (currentPage === "notifications") {
            fetchNotificationsData('alert');
        }
        if (currentPage === "announcements") {
            fetchNotificationsData('announcement');
        }
    }, [currentPage]);

    // Socket.IO for real-time updates
    useEffect(() => {
        const socket = io(IMG_BASE);
        socket.on('data_updated', () => {
            console.log("Real-time update received!");
            if (currentPage === "dashboard" || currentPage === "search") {
                fetch(`${API_BASE}/get_equipments.php`).then(r => r.json()).then(setEquipments).catch(console.error);
            }
            if (currentPage === "dashboard" || currentPage === "status") {
                fetchBorrowed();
            }
            if (currentPage === "dashboard" || currentPage === "queue") {
                fetchMyQueue();
            }
            if (currentPage === "notifications") {
                fetchNotificationsData('alert');
            }
            if (currentPage === "announcements") {
                fetchNotificationsData('announcement');
            }
        });

        return () => {
            socket.off('data_updated');
            socket.disconnect();
        };
    }, [currentPage, studentId]);

    const fetchBorrowed = () => {
        if (!studentId) return;
        authFetch(`/get_borrowed.php?student_id=${studentId}`)
            .then(result => { if (result.success) setBorrowedItems(result.data); })
            .catch(console.error);
    };

    const fetchMyQueue = async () => {
        if (!studentId) return;
        setIsQueueLoading(true);
        try {
            const result = await authFetch(`/my_queue.php?student_id=${studentId}`);
            if (result.success) setMyQueueItems(result.data);
        } catch (e) { console.error(e); }
        setIsQueueLoading(false);
    };

    const fetchNotificationsData = async (type) => {
        setIsNotificationsLoading(true);
        let notifs = [];
        const today = new Date();

        try {
            if (type === 'alert') {
                // 1. Process Receipts from borrowedItems
                const groups = {};
                borrowedItems.forEach(item => {
                    const key = item.borrow_date ? item.borrow_date.substring(0, 16) : 'unknown';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(item);
                });

                Object.keys(groups).forEach(key => {
                    const items = groups[key];
                    const firstItem = items[0];
                    if (!firstItem.borrow_date) return;
                    
                    const borrowDate = new Date(firstItem.borrow_date);
                    const txId = firstItem.transaction_id || 'LB' + String(firstItem.id).padStart(6, '0');
                    const allReturned = items.every(i => i.status === 'returned');
                    
                    const title = allReturned ? 'คืนอุปกรณ์สำเร็จ' : 'ยืนยันยืมอุปกรณ์สำเร็จ';
                    const notifType = allReturned ? 'success' : 'info';
                    
                    notifs.push({
                        id: `tx-${txId}`,
                        type: notifType,
                        title: title,
                        desc: `หมายเลขทำรายการ ${txId} (${items.length} รายการ)`,
                        date: borrowDate,
                        receiptTxId: txId,
                        action: 'receipt'
                    });
                });

                // 2. Process Due Soon / Overdue
                borrowedItems.forEach(item => {
                    if (item.status === 'borrowed') {
                        const borrowDate = new Date(item.borrow_date);
                        const dueDate = new Date(borrowDate);
                        dueDate.setDate(dueDate.getDate() + (item.borrow_days || 3));
                        
                        const oneDay = 24 * 60 * 60 * 1000;
                        const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / oneDay);

                        if (daysLeft < 0) {
                            notifs.push({
                                id: `overdue-${item.id}`,
                                type: 'danger',
                                title: 'เลยกำหนดคืนอุปกรณ์!',
                                desc: `"${item.name || item.equipment_id}" เลยกำหนดคืนมา ${Math.abs(daysLeft)} วัน`,
                                date: today,
                                action: 'status'
                            });
                        } else if (daysLeft <= 1) {
                            notifs.push({
                                id: `due-${item.id}`,
                                type: 'warning',
                                title: 'ใกล้ครบกำหนดคืนอุปกรณ์',
                                desc: `"${item.name || item.equipment_id}" จะครบกำหนดในอีก ${daysLeft === 0 ? 'วันนี้' : daysLeft + ' วัน'}`,
                                date: today,
                                action: 'status'
                            });
                        }
                    }
                });
            }

            // 3. Fetch from API (alerts or announcements)
            try {
                const sysRes = await authFetch(`/get_notifications.php?student_id=${studentId}&type=${type}`);
                if (sysRes.success && Array.isArray(sysRes.data)) {
                    sysRes.data.forEach(item => {
                        notifs.push({
                            id: `db-${type}-${item.id}`,
                            type: type === 'announcement' ? 'system' : 'warning',
                            title: item.title,
                            desc: item.message,
                            image_url: item.image_url,
                            date: new Date(item.created_at),
                            action: 'none'
                        });
                    });
                }
            } catch (err) { console.error('Error fetching API notifications:', err); }

            // Default announcement if none
            if (type === 'announcement' && notifs.length === 0) {
                notifs.push({
                    id: 'system-welcome',
                    type: 'system',
                    title: 'ยินดีต้อนรับสู่ระบบยืมคืนอุปกรณ์',
                    desc: 'สามารถติดตามข่าวสารและการอัปเดตใหม่ๆ ได้ที่นี่',
                    date: today,
                    action: 'none'
                });
            }

            notifs.sort((a, b) => b.date - a.date);
            setNotifications(notifs);

        } catch (e) {
            console.error('Error in fetchNotificationsData:', e);
        } finally {
            setIsNotificationsLoading(false);
        }
    };

    // Open report lost modal
    const openReportLostModal = (item) => {
        setLostItemTarget(item);
        setLostDate(new Date().toISOString().split('T')[0]);
        setLostNote("");
        setIsLostModalOpen(true);
    };

    // Handle report lost submit
    const handleReportLostSubmit = async (e) => {
        e.preventDefault();
        if (!lostItemTarget || !lostDate) {
            showToast('กรุณาระบุวันที่สูญหาย', 'warning');
            return;
        }
        setIsSubmittingLost(true);
        try {
            const data = await authFetch('/report_lost.php', {
                method: 'POST',
                body: JSON.stringify({
                    id: lostItemTarget.id,
                    student_id: studentId,
                    lost_date: lostDate,
                    lost_note: lostNote
                })
            });
            if (data.success) {
                showToast(data.message || 'บันทึกการแจ้งอุปกรณ์สูญหายเรียบร้อยแล้ว', 'success');
                setIsLostModalOpen(false);
                setLostItemTarget(null);
                fetchBorrowed();
            } else {
                showToast(data.message || 'เกิดข้อผิดพลาดในการทำรายการ', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
        }
        setIsSubmittingLost(false);
    };

    // Handle save settings
    const handleSaveSettings = async (e) => {
        e.preventDefault();
        setSettingsMsg({ type: "", text: "" });

        setIsSavingSettings(true);
        try {
            const data = await authFetch('/update_student_profile.php', {
                method: 'POST',
                body: JSON.stringify({
                    student_id: studentId,
                    name_th: settingsForm.name_th,
                    name_en: settingsForm.name_en,
                    email: settingsForm.email,
                    phone_number: settingsForm.phone_number,
                    department: settingsForm.department
                })
            });
            if (data.success) {
                showToast(data.message || 'บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
                setSettingsMsg({ type: "success", text: data.message || "บันทึกการตั้งค่าเรียบร้อยแล้ว" });
                setStudent(data.data);
            } else {
                showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
                setSettingsMsg({ type: "error", text: data.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์', 'error');
            setSettingsMsg({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์" });
        }
        setIsSavingSettings(false);
    };

    const fetchNotifications = async () => {
        try {
            const data = await authFetch(`/get_notifications.php?student_id=${studentId}&type=announcement`);
            if (data.success) setNotifications(data.data);
        } catch (e) { console.error(e); }
    };

    // Cart functions
    const addToCart = (item) => {
        if (cartItems.find(c => c.equipment_id === item.equipment_id)) {
            showToast('อุปกรณ์นี้อยู่ในตะกร้าแล้ว', 'warning');
            return false;
        }
        
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
        const borrowedTodayCount = borrowedItems.filter(i => {
            if (!i.borrow_date || i.status === 'rejected') return false;
            try {
                const bDate = new Date(i.borrow_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
                return bDate === todayStr;
            } catch(e) { return false; }
        }).length;

        if (borrowedTodayCount + cartItems.length >= 5) {
            showToast(`คุณสามารถยืมอุปกรณ์ได้สูงสุด 5 ชิ้นต่อวัน`, 'error');
            return false;
        }

        setCartItems(prev => [...prev, item]);
        return true;
    };

    const removeFromCart = (equipmentId) => {
        setCartItems(prev => prev.filter(c => c.equipment_id !== equipmentId));
    };

    // Checkout
    const handleCheckout = async () => {
        if (cartItems.length === 0) return;
        setIsLoading(true);
        let successItems = [];
        const selectedPickupDateTime = `${pickupDate}T${pickupTime}:00`;

        for (const item of cartItems) {
            try {
                const result = await authFetch('/checkout.php', {
                    method: 'POST',
                    body: JSON.stringify({
                        student_id: studentId,
                        equipment_id: item.equipment_id,
                        pickup_time: selectedPickupDateTime
                    })
                });
                if (result.success) {
                    successItems.push(item);
                } else {
                    showToast(result.message || 'ไม่สามารถทำรายการได้', 'error');
                }
            } catch (e) { console.error(e); }
        }
        if (successItems.length > 0) {
            const txId = 'LB' + Math.floor(100000 + Math.random() * 900000);
            
            let borrowTime;
            try {
                borrowTime = new Date().toLocaleString('th-TH', { 
                    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                });
            } catch(e) {
                borrowTime = new Date().toLocaleString('th-TH');
            }
            
            setTransactionDetails({
                transactionId: txId,
                borrowTime: borrowTime,
                pickupTime: `${pickupDate} ${pickupTime}`,
                items: successItems
            });

            setTransactionId(txId);
            setCheckoutSuccess(true);
            setCartItems([]);
            showToast(`ส่งคำขอยืมสำเร็จ ${successItems.length} รายการ`, 'success');
        }
        setIsLoading(false);
    };

    // Borrow — ยืมอุปกรณ์ (เฉพาะที่ยังมี)
    const handleBorrow = async (equipment) => {
        setIsLoading(true);
        try {
            const result = await authFetch('/checkout.php', {
                method: 'POST',
                body: JSON.stringify({
                    student_id: studentId,
                    equipment_id: equipment.equipment_id
                })
            });
            if (result.success) {
                showToast(result.message || 'ส่งคำขอยืมสำเร็จ', 'success');
                setCheckoutSuccess(true);
                setTransactionDetails({
                    equipmentName: equipment.name,
                    borrowTime: new Date().toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                    })
                });
                setIsDetailOpen(false);
                fetchBorrowed();
                fetch(`${API_BASE}/get_equipments.php`).then(r => r.json()).then(setEquipments).catch(console.error);
            } else {
                showToast(result.message || 'ไม่สามารถทำรายการได้', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
        }
        setIsLoading(false);
    };

    // Join Queue — จองคิวอุปกรณ์
    const handleJoinQueue = async (equipment) => {
        setIsLoading(true);
        try {
            const result = await authFetch('/join_queue.php', {
                method: 'POST',
                body: JSON.stringify({
                    student_id: studentId,
                    equipment_id: equipment.equipment_id
                })
            });
            if (result.success) {
                showToast(result.message || 'จองคิวสำเร็จ', 'success');
                setIsDetailOpen(false);
                fetchMyQueue();
                setCurrentPage("queue");
            } else {
                showToast(result.message || 'ไม่สามารถจองคิวได้', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
        }
        setIsLoading(false);
    };

    // Cancel Queue — ยกเลิกคิว
    const handleCancelQueue = async (queueId) => {
        if (!confirm("คุณต้องการยกเลิกคิวนี้ใช่หรือไม่?")) return;
        try {
            const result = await authFetch('/cancel_queue.php', {
                method: 'POST',
                body: JSON.stringify({
                    id: queueId,
                    student_id: studentId
                })
            });
            if (result.success) {
                showToast('ยกเลิกคิวเรียบร้อยแล้ว', 'success');
                fetchMyQueue();
            } else {
                showToast(result.message || 'ไม่สามารถยกเลิกคิวได้', 'error');
            }
        } catch (e) { console.error(e); }
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

    // Cancel borrow request
    const handleCancelRequest = async (id) => {
        if (!confirm("คุณต้องการยกเลิกคำขอยืมอุปกรณ์นี้ใช่หรือไม่?")) return;
        try {
            const data = await authFetch('/cancel_request.php', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            if (data.success) {
                fetchBorrowed();
                showToast('ยกเลิกรายการเรียบร้อยแล้ว', 'success');
            }
        } catch (e) { console.error(e); }
    };

    // Derived data
    const activeItems = borrowedItems.filter(i => i.status === 'borrowed' || i.status === 'pending');
    const returnedCount = borrowedItems.filter(i => i.status === 'returned').length;

    // Status filtered items
    const filteredStatusItems = borrowedItems.filter(item => {
        if (item.status === 'rejected') return false;
        if (statusTab === 'ทั้งหมด') return true;
        if (statusTab === 'กำลังยืม') return item.status === 'borrowed';
        if (statusTab === 'เกินกำหนด') {
            const s = getItemStatus(item);
            return item.status === 'overdue' || (item.status === 'borrowed' && s.type === 'overdue') || item.status === 'damaged_lost';
        }
        if (statusTab === 'สูญหาย/ชำรุด') return item.status === 'damaged_lost';
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
        if (key === "queue") return myQueueItems.length || null;
        return null;
    };

    return (
        <div className="min-h-screen bg-[#F9F8FD] flex flex-col md:flex-row pb-20 md:pb-0">
            {/* ================= TOAST ================= */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {/* ================= MOBILE HEADER ================= */}
            <div className="md:hidden sticky top-0 z-30 bg-[#3D2B56] text-white px-4 py-3 flex items-center justify-between shadow-md border-b border-white/10">
                <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="Libraries SUT" className="h-16 object-contain ml-1" />
                </div>
                <div className="flex items-center gap-2.5">
                    <button onClick={() => setCurrentPage("announcements")} className="p-1.5 text-purple-200 hover:text-white rounded-lg hover:bg-white/10 transition relative">
                        <Megaphone size={16} />
                    </button>
                    <button onClick={() => setCurrentPage("notifications")} className="p-1.5 text-purple-200 hover:text-white rounded-lg hover:bg-white/10 transition relative">
                        <Bell size={16} />
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    </button>
                    <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center overflow-hidden shrink-0 ml-1">
                        {student?.student_img ? (
                            <img src={`${IMG_BASE}${student.student_img}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <User size={13} />
                        )}
                    </div>
                </div>
            </div>

            {/* ================= DESKTOP SIDEBAR ================= */}
            <div className="hidden md:flex w-[250px] shrink-0 bg-[#3D2B56] text-white p-5 flex-col sticky top-0 h-screen">
                <div className="flex items-center px-1 pt-0 pb-2 justify-center">
                    <img src="/logo.png" alt="Libraries SUT" className="h-28 object-contain" />
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
                                    setCheckoutSuccess(false);
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

            {/* ================= MOBILE BOTTOM NAVBAR ================= */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#3D2B56] text-white border-t border-white/15 px-1 py-1.5 flex justify-around items-center shadow-2xl backdrop-blur-lg">
                {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = currentPage === item.key;
                    const count = badgeCount(item.key);
                    return (
                        <button
                            key={item.key}
                            onClick={() => {
                                setCurrentPage(item.key);
                                setCheckoutSuccess(false);
                            }}
                            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition relative ${active ? 'text-white bg-white/20 font-bold' : 'text-purple-200 hover:text-white'}`}
                        >
                            <div className="relative">
                                <Icon size={20} />
                                {count && (
                                    <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">
                                        {count}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] mt-0.5 font-medium leading-none">{item.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* ================= MAIN CONTENT ================= */}
            <div className="flex-1 overflow-y-auto relative">
                {/* Desktop Top Header */}
                <div className="hidden md:flex sticky top-0 z-20 bg-[#F9F8FD]/90 backdrop-blur-md border-b border-purple-100/50 px-8 py-3 items-center justify-end gap-3">
                    <button onClick={() => setCurrentPage("announcements")} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 hover:text-[#3D2B56] hover:bg-purple-50 transition relative border border-slate-100">
                        <Megaphone size={18} />
                    </button>
                    <button onClick={() => setCurrentPage("notifications")} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-500 hover:text-[#3D2B56] hover:bg-purple-50 transition relative border border-slate-100">
                        <Bell size={18} />
                        <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                    </button>
                </div>

                {/* ===== NOTIFICATIONS ===== */}
                {currentPage === "notifications" ? (
                    <NotificationsView 
                        title="การแจ้งเตือน"
                        notifications={notifications}
                        isLoading={isNotificationsLoading}
                        onNotificationClick={(notif) => {
                            if (notif.action === 'receipt' && notif.receiptTxId) {
                                const receipt = groupedReceipts.find(g => g.txId === notif.receiptTxId);
                                if (receipt) {
                                    setSelectedReceipt(receipt);
                                    setSettingsModal('receipt');
                                }
                            } else if (notif.action === 'status') {
                                setCurrentPage("status");
                            }
                        }}
                    />
                ) : currentPage === "announcements" ? (
                    <NotificationsView 
                        title="ประกาศจากแอดมิน"
                        notifications={notifications}
                        isLoading={isNotificationsLoading}
                        onNotificationClick={(notif) => {}}
                    />
                ) : currentPage === "dashboard" ? (
                    <>

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
                                    {[...equipments].sort((a, b) => b.equipment_id - a.equipment_id).slice(0, 5).map(item => (
                                        <button key={item.equipment_id} onClick={() => openDetail(item.equipment_id)}
                                            className="relative bg-white border border-purple-100 rounded-2xl p-4 text-center hover:shadow-md hover:border-purple-200 transition group">
                                            
                                            {/* NEW Badge */}
                                            {item.created_at && (new Date() - new Date(item.created_at)) / (1000 * 60 * 60 * 24) <= 14 && (
                                                <div className="absolute top-3 right-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] tracking-wider font-extrabold px-2 py-0.5 rounded-full shadow-sm">
                                                    NEW
                                                </div>
                                            )}

                                            <div className="w-16 h-12 mx-auto bg-purple-50 rounded-xl flex items-center justify-center mb-3 overflow-hidden mt-1">
                                                {item.equipment_img ? (
                                                    <img src={`${IMG_BASE}${item.equipment_img}`} alt="" className="w-10 h-10 object-contain" />
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
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[16px] font-bold text-slate-800">รายการที่กำลังยืมอยู่</h3>
                                    {activeItems.length > 0 && (
                                        <button onClick={() => setCurrentPage("status")} className="text-[13px] font-bold text-purple-600 hover:underline">ดูทั้งหมด</button>
                                    )}
                                </div>
                                {activeItems.length > 0 ? (
                                    <div className="space-y-3">
                                        {activeItems.slice(0, 3).map((item) => {
                                            const s = getItemStatus(item);
                                            return (
                                                <div key={item.id} className="bg-white border border-purple-100 rounded-2xl p-4 flex items-center gap-4">
                                                    <div className="w-11 h-11 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                                        {item.equipment_img ? (
                                                            <img src={`${IMG_BASE}${item.equipment_img}`} alt="" className="w-7 h-7 object-contain" />
                                                        ) : (
                                                            <Package size={20} className="text-purple-400" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[14px] font-bold text-slate-800 truncate">{item.name || `อุปกรณ์ #${item.equipment_id}`}</p>
                                                        {item.status === 'pending' ? (
                                                            <p className="text-[12px] text-amber-600">นัดรับ {new Date(item.pickup_time || item.borrow_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
                                                        ) : (
                                                            <p className="text-[12px] text-slate-400">กำหนดคืน {formatThaiDate(s.dueDate)}</p>
                                                        )}
                                                    </div>
                                                    <span className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${getBadgeStyle(s.type)}`}>{s.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="bg-white border border-purple-100 border-dashed rounded-2xl p-6 text-center">
                                        <p className="text-[14px] text-slate-500">ไม่มีรายการที่กำลังยืมอยู่</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>

                /* ===== SEARCH ===== */
                ) : currentPage === "search" ? (
                    <>

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
                            <div className="flex gap-2 overflow-x-auto pb-3 mb-5 whitespace-nowrap">
                                {CATEGORIES.map(cat => (
                                    <button key={cat} onClick={() => setActiveCategory(cat)}
                                        className={`px-4 py-2 rounded-full text-[13px] font-semibold transition shrink-0 ${activeCategory === cat ? 'bg-[#3D2B56] text-white shadow-md' : 'bg-white border border-purple-100 text-slate-600 hover:border-purple-300'}`}>
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
                                                <img src={`${IMG_BASE}${item.equipment_img}`} alt="" className="w-full h-full object-contain" />
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

                        <div className="p-8 pt-6 space-y-6">
                            {cartItems.length === 0 ? (
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

                                    {/* Pickup Schedule Picker */}
                                    <div className="bg-white border border-purple-100 rounded-3xl p-5 shadow-sm space-y-3">
                                        <div className="flex items-center gap-2 text-[#3D2B56] font-bold text-[14.5px] pb-2 border-b border-slate-100">
                                            <Clock size={18} className="text-purple-600" />
                                            <span>เลือกวัน-เวลานัดรับอุปกรณ์ (จองล่วงหน้าได้ไม่เกิน 1 วัน)</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                            <div>
                                                <label className="block text-[12px] font-semibold text-slate-600 mb-1">วันที่นัดรับ</label>
                                                <input
                                                    type="date"
                                                    min={new Date().toISOString().split('T')[0]}
                                                    max={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                                                    value={pickupDate}
                                                    onChange={e => setPickupDate(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-[13.5px] outline-none focus:border-purple-500 font-sans"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-semibold text-slate-600 mb-1">เวลานัดรับ</label>
                                                <input
                                                    type="time"
                                                    value={pickupTime}
                                                    onChange={e => setPickupTime(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-[13.5px] outline-none focus:border-purple-500 font-sans"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[12px] text-amber-800 leading-relaxed">
                                            ⚠️ <strong>เงื่อนไขการจองและการรับอุปกรณ์:</strong>
                                            <br />
                                            • สามารถจองล่วงหน้าได้ <strong>สูงสุด 1 วัน</strong> (วันนี้ หรือ วันพรุ่งนี้)
                                            <br />
                                            • เมื่อถึงเวลานัดรับ ต้องมารับอุปกรณ์ <strong>ภายใน 30 นาที</strong> หากเกินกำหนดระบบจะทำการตัดสิทธิ์และนำอุปกรณ์กลับเข้าคลังโดยอัตโนมัติ
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="flex gap-3 items-start p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                        <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
                                        <div className="text-[12.5px] text-slate-600 leading-relaxed">
                                            <p className="font-bold text-[#3D2B56] mb-1">ข้อกำหนดการยืม</p>
                                            <p>• ยืมได้สูงสุด 5 ชิ้น/ครั้ง • กำหนดคืนตามจำนวนวันของอุปกรณ์แต่ละชิ้น</p>
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

                /* ===== QUEUE (คิวของฉัน) ===== */
                ) : currentPage === "queue" ? (
                    <>

                        <div className="p-8 pt-6 space-y-6">
                            {myQueueItems.length === 0 ? (
                                <div className="text-center py-16">
                                    <Timer size={48} className="mx-auto text-purple-200 mb-4" />
                                    <p className="text-slate-500 font-semibold mb-2">ยังไม่มีคิวที่จอง</p>
                                    <p className="text-[13px] text-slate-400 mb-4">จองคิวได้เมื่ออุปกรณ์ที่ต้องการหมด</p>
                                    <button onClick={() => setCurrentPage("search")} className="px-5 py-2.5 bg-[#3D2B56] text-white rounded-xl text-[13px] font-bold hover:bg-[#2d1f40] transition">
                                        ค้นหาอุปกรณ์
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Called queue alert */}
                                    {myQueueItems.filter(q => q.status === 'called').map(q => (
                                        <div key={q.id} className="bg-green-50 border-2 border-green-400 rounded-2xl p-5 animate-pulse">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                                    <Bell size={20} className="text-green-600" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-bold text-green-800 text-[15px]">ถึงคิวของคุณแล้ว!</p>
                                                    <p className="text-[13px] text-green-700">กรุณามารับ "{q.equipment_name}" ภายใน 5 นาที</p>
                                                </div>
                                            </div>
                                            {q.expires_at && (
                                                <div className="bg-white rounded-xl p-3 flex items-center justify-between">
                                                    <span className="text-[13px] text-slate-600 font-semibold">⏰ หมดเวลา</span>
                                                    <span className="text-[14px] font-bold text-red-600">
                                                        {new Date(q.expires_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Queue list */}
                                    <div className="bg-white border border-purple-100 rounded-3xl shadow-sm overflow-hidden">
                                        <div className="px-6 py-4 border-b border-purple-50 bg-purple-50/50">
                                            <h3 className="font-bold text-[15px] text-slate-700">คิวที่จองอยู่ ({myQueueItems.length} รายการ)</h3>
                                        </div>
                                        <div className="divide-y divide-purple-50">
                                            {myQueueItems.map(q => (
                                                <div key={q.id} className={`px-6 py-4 flex items-center gap-4 ${q.status === 'called' ? 'bg-green-50' : ''}`}>
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${q.status === 'called' ? 'bg-green-100' : 'bg-purple-50'}`}>
                                                        {q.equipment_img ? (
                                                            <img src={`${IMG_BASE}${q.equipment_img}`} alt="" className="w-8 h-8 object-contain" />
                                                        ) : (
                                                            <span className="text-xl font-bold text-purple-500">#{q.position}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[14px] font-bold text-slate-700 truncate">{q.equipment_name || `อุปกรณ์ #${q.equipment_id}`}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${q.status === 'called' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {q.status === 'called' ? '🔔 ถึงคิวแล้ว!' : `ลำดับที่ ${q.position}`}
                                                            </span>
                                                            <span className="text-[11px] text-slate-400">
                                                                จองเมื่อ {new Date(q.queued_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleCancelQueue(q.id)} 
                                                        className="w-8 h-8 rounded-lg border border-red-200 text-red-500 flex items-center justify-center hover:bg-red-50 transition" title="ยกเลิกคิว">
                                                        <X size={15} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Queue info */}
                                    <div className="flex gap-3 items-start p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                        <Info size={18} className="text-purple-600 shrink-0 mt-0.5" />
                                        <div className="text-[12.5px] text-slate-600 leading-relaxed">
                                            <p className="font-bold text-[#3D2B56] mb-1">กฎของระบบคิว</p>
                                            <p>• คิวสูงสุด 10 คนต่ออุปกรณ์ • เมื่อถึงคิว มีเวลา 5 นาทีในการมารับ</p>
                                            <p className="text-red-500 font-bold mt-1">⚠️ หากไม่มารับภายใน 5 นาที คิวจะถูกข้ามไปยังคนถัดไปอัตโนมัติ</p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </>

                /* ===== STATUS ===== */
                ) : currentPage === "status" ? (
                    <>

                        <div className="p-8 pt-6 space-y-5">
                            {/* Filter tabs */}
                            <div className="flex gap-2 overflow-x-auto pb-1 whitespace-nowrap">
                                {['ทั้งหมด', 'กำลังยืม', 'เกินกำหนด', 'สูญหาย/ชำรุด', 'คืนแล้ว'].map(tab => (
                                    <button key={tab} onClick={() => setStatusTab(tab)}
                                        className={`px-4 py-2 rounded-full text-[13px] font-semibold transition shrink-0 ${statusTab === tab ? 'bg-[#3D2B56] text-white' : 'bg-white border border-purple-100 text-[#3D2B56] hover:border-purple-300'}`}>
                                        {tab}
                                    </button>
                                ))}
                            </div>

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

                                        {/* Pickup time & 30-min expiration alert */}
                                        {item.status === 'pending' && item.reservation_expires_at && (
                                            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-amber-800">
                                                <div className="flex items-center gap-1.5 font-bold">
                                                    <Clock size={15} className="text-amber-600" />
                                                    <span>เวลานัดรับ: {new Date(item.pickup_time || item.borrow_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>
                                                </div>
                                                <span className="text-red-600 font-bold bg-white px-2 py-1 rounded-lg border border-red-200 shadow-sm">
                                                    ⏰ ต้องมารับก่อน {new Date(item.reservation_expires_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น. (ไม่เกิน 30 นาที)
                                                </span>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        {item.status === 'pending' && (
                                            <div className="mt-3 grid grid-cols-1 gap-2">
                                                <button onClick={() => handleCancelRequest(item.id)}
                                                    className="w-full py-2.5 border border-red-200 text-red-500 rounded-xl text-[13px] font-bold hover:bg-red-50 transition flex items-center justify-center gap-2">
                                                    <X size={15} /> ยกเลิกรายการนี้
                                                </button>
                                            </div>
                                        )}

                                        {/* Lost item detail display */}
                                        {item.status === 'damaged_lost' && (
                                            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3.5 space-y-1">
                                                <div className="flex items-center gap-2 text-orange-800 font-bold text-[13px]">
                                                    <AlertTriangle size={16} className="text-orange-600 shrink-0" />
                                                    <span>วันที่แจ้งสูญหาย / วันที่หาย: <span className="text-red-600">{formatThaiDate(item.lost_date)}</span></span>
                                                </div>
                                                {item.lost_note && (
                                                    <p className="text-[12px] text-slate-600 pl-6"><strong>หมายเหตุ:</strong> {item.lost_note}</p>
                                                )}
                                                <p className="text-[11.5px] text-orange-700 pl-6 pt-1">
                                                    * สถานะสูญหาย/ชำรุดแล้ว กรุณาติดต่อบรรณารักษ์
                                                </p>
                                            </div>
                                        )}

                                        {/* Return date */}
                                        {item.return_date && item.status !== 'damaged_lost' && (
                                            <div className="flex items-center gap-1.5 mt-3">
                                                <CheckCircle size={14} className={s.type === 'returned-late' ? 'text-red-500' : 'text-green-500'} />
                                                <span className={`text-[12px] font-semibold ${s.type === 'returned-late' ? 'text-red-500' : 'text-green-600'}`}>คืนเมื่อ {formatThaiDate(item.return_date)}</span>
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
                                </div>
                            </div>
                        </div>
                    </>

                /* ===== NOTIFICATIONS ===== */
                ) : currentPage === "notifications" ? (
                    <>

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
                                            {notif.image_url && (
                                                <div className="mt-3">
                                                    <img src={`http://localhost:5000/${notif.image_url}`} alt="Notification" className="rounded-xl max-h-40 object-cover" />
                                                </div>
                                            )}
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

                /* ===== SETTINGS ===== */
                ) : currentPage === "settings" ? (
                    <>

                        <div className="p-8 pt-6 max-w-4xl mx-auto space-y-8">
                            
                            {/* Profile Card */}
                            <div className="bg-[#3D2B56] rounded-[24px] p-6 shadow-xl shadow-[#3D2B56]/20 text-white flex items-center gap-5">
                                <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                    {student?.student_img ? (
                                        <img src={`${IMG_BASE}${student.student_img}`} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={32} className="text-white/60" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{student?.name_th || 'ผู้ใช้งานทั่วไป'}</h2>
                                    <p className="text-white/70 text-[14px] mt-1">รหัสนักศึกษา {studentId || '-'}</p>
                                </div>
                            </div>

                            {/* Section 1: บัญชีผู้ใช้ */}
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-800 mb-3 ml-2">บัญชีผู้ใช้</h3>
                                <div className="bg-white border border-purple-100 rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
                                    <button onClick={() => setSettingsModal('personal')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <User size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">ข้อมูลส่วนตัว</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">ดูอีเมลและเบอร์โทรศัพท์</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                    <button onClick={() => setSettingsModal('history')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <ClipboardList size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">ประวัติการยืม-คืน</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">ดูรายการทั้งหมดย้อนหลัง</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                    <button onClick={() => setSettingsModal('receipt')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <FileText size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">ใบเสร็จการยืม</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">ดูสลิปรายละเอียดการทำรายการยืม</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                    <button onClick={() => setSettingsModal('security')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <Lock size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">ความปลอดภัย</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">{localStorage.getItem('user_pin') ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                </div>
                            </div>

                            {/* Section 2: ข้อมูลห้องสมุด */}
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-800 mb-3 ml-2">ข้อมูลห้องสมุด</h3>
                                <div className="bg-white border border-purple-100 rounded-3xl overflow-hidden shadow-sm">
                                    <button onClick={() => setSettingsModal('calendar')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <Calendar size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">ปฏิทินและเวลาทำการ</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">ดูวันเปิด-ปิดของห้องสมุด</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                </div>
                            </div>
                            
                            {/* Section 3: การแจ้งเตือน */}
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-800 mb-3 ml-2">การแจ้งเตือน</h3>
                                <div className="bg-white border border-purple-100 rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
                                    <div className="flex items-center gap-4 p-4">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <Bell size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">แจ้งเตือนก่อนครบกำหนดคืน</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">แจ้งเตือนเป็นระยะช่วงๆ</div>
                                        </div>
                                        <div onClick={() => setNotifyDue(!notifyDue)} className={`w-12 h-6 ${notifyDue ? 'bg-[#2196F3]' : 'bg-slate-200'} rounded-full flex items-center px-1 shrink-0 cursor-pointer transition-colors duration-200`}>
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${notifyDue ? 'translate-x-6' : ''}`}></div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Section 4: ทั่วไป */}
                            <div>
                                <h3 className="text-[15px] font-bold text-slate-800 mb-3 ml-2">ทั่วไป</h3>
                                <div className="bg-white border border-purple-100 rounded-3xl overflow-hidden shadow-sm divide-y divide-slate-100">
                                    <button onClick={() => setSettingsModal('guide')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left">
                                        <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                                            <BookOpen size={18} className="text-[#3D2B56]" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-slate-800">คู่มือการใช้งานเบื้องต้น</div>
                                            <div className="text-[12px] text-slate-500 mt-0.5">วิธีการใช้งานแอปพลิเคชัน</div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-300" />
                                    </button>
                                    <button onClick={onLogout} className="w-full flex items-center gap-4 p-4 hover:bg-red-50 transition text-left">
                                        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                                            <LogOut size={18} className="text-red-500" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[14px] font-bold text-red-500">ออกจากระบบ</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>

            {/* ================= MODALS ================= */}
            {checkoutSuccess && transactionDetails && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
                    <div className="bg-white border border-green-200 rounded-3xl p-8 w-full max-w-sm mx-auto shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} className="text-green-600" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 mb-1">ส่งคำขอยืมสำเร็จ!</h2>
                            {transactionDetails.equipmentName ? (
                                <p className="text-slate-500 text-[13px] leading-relaxed">คำขอยืมอุปกรณ์<br/>"{transactionDetails.equipmentName}"<br/>ถูกส่งเรียบร้อย</p>
                            ) : (
                                <p className="text-slate-500 text-[13px] leading-relaxed">บันทึกรายการยืมของคุณเรียบร้อยแล้ว</p>
                            )}
                        </div>

                        {transactionDetails.transactionId && (
                            <div className="flex flex-col items-center justify-center mb-6">
                                <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                                    <QRCode value={transactionDetails.transactionId} size={150} />
                                </div>
                                <p className="text-[12px] text-slate-400 mt-3 font-mono">{transactionDetails.transactionId}</p>
                            </div>
                        )}
                        
                        <div className="bg-[#F9F8FD] rounded-2xl p-4 mb-6 border border-purple-50 space-y-3">
                            <div className="flex justify-between items-center pb-3 border-b border-purple-100/50">
                                <span className="text-sm text-slate-500">วันเวลาที่ยืม</span>
                                <span className="text-sm font-bold text-slate-800">{transactionDetails.borrowTime}</span>
                            </div>
                            {transactionDetails.pickupTime && (
                                <div className="flex justify-between items-center pb-3 border-b border-purple-100/50">
                                    <span className="text-sm text-slate-500">กำหนดรับอุปกรณ์</span>
                                    <span className="text-sm font-bold text-slate-800">{transactionDetails.pickupTime}</span>
                                </div>
                            )}
                            {transactionDetails.items && (
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">จำนวนรายการ</span>
                                    <span className="text-sm font-bold text-slate-800">{transactionDetails.items.length} ชิ้น</span>
                                </div>
                            )}
                        </div>

                        {transactionDetails.items && (
                            <div className="mb-6">
                                <h3 className="font-bold text-slate-800 mb-3 text-sm">รายการอุปกรณ์ที่ยืม</h3>
                                <div className="space-y-3">
                                    {transactionDetails.items.map((item, idx) => (
                                        <div key={idx} className="flex gap-3 bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                                            <div className="w-12 h-12 bg-slate-50 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-slate-100">
                                                {item.equipment_img || item.image_url ? (
                                                    <img src={`${IMG_BASE}${(item.equipment_img || item.image_url).replace(/\.jpeg$/i, '.jpg')}`} alt={item.name} className="w-full h-full object-contain" />
                                                ) : (
                                                    <Package size={20} className="text-slate-300" />
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden flex flex-col justify-center">
                                                <div className="text-[13px] font-bold text-slate-800 truncate">{item.name}</div>
                                                <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.category} • {item.kit_code || item.equipment_id}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button onClick={() => { setCheckoutSuccess(false); setCurrentPage("status"); }}
                                className="w-full py-3.5 bg-[#3D2B56] text-white rounded-xl text-[13.5px] font-bold hover:bg-[#2d1f40] shadow-lg shadow-[#3D2B56]/20 transition">
                                ดูรายการของฉัน
                            </button>
                            <button onClick={() => { setCheckoutSuccess(false); setCurrentPage("dashboard"); }}
                                className="w-full py-3.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[13.5px] font-bold hover:bg-slate-100 transition">
                                กลับหน้าหลัก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= SETTINGS MODALS ================= */}
            {settingsModal === 'personal' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><User size={18} className="text-[#3D2B56]" /> ข้อมูลส่วนตัว</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {settingsMsg.text && (
                                <div className={`p-4 mb-5 rounded-2xl border flex items-center gap-3 ${settingsMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    {settingsMsg.type === 'success' ? <CheckCircle size={20} className="shrink-0" /> : <AlertCircle size={20} className="shrink-0" />}
                                    <span className="text-[13.5px] font-semibold">{settingsMsg.text}</span>
                                </div>
                            )}
                            <form onSubmit={(e) => { handleSaveSettings(e); setSettingsModal(null); }} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1.5">ชื่อ-นามสกุล (ภาษาไทย)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.name_th}
                                            onChange={e => setSettingsForm({ ...settingsForm, name_th: e.target.value })}
                                            placeholder="ชื่อ-นามสกุล"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-500 focus:bg-white transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1.5">Name - Surname (English)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.name_en}
                                            onChange={e => setSettingsForm({ ...settingsForm, name_en: e.target.value })}
                                            placeholder="Full name in English"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-500 focus:bg-white transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1.5">อีเมล (Email)</label>
                                        <input
                                            type="email"
                                            value={settingsForm.email}
                                            onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })}
                                            placeholder="student@g.sut.ac.th"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-500 focus:bg-white transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1.5">เบอร์โทรศัพท์ (Phone)</label>
                                        <input
                                            type="tel"
                                            value={settingsForm.phone_number}
                                            onChange={e => setSettingsForm({ ...settingsForm, phone_number: e.target.value })}
                                            placeholder="0812345678"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-500 focus:bg-white transition"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[12.5px] font-semibold text-slate-600 mb-1.5">สาขาวิชา / คณะ (Department)</label>
                                        <input
                                            type="text"
                                            value={settingsForm.department}
                                            onChange={e => setSettingsForm({ ...settingsForm, department: e.target.value })}
                                            placeholder="วิศวกรรมซอฟต์แวร์"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[13.5px] outline-none focus:border-purple-500 focus:bg-white transition"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSavingSettings}
                                        className="px-6 py-3 bg-[#3D2B56] hover:bg-[#2d1f40] text-white rounded-2xl font-bold text-[14px] shadow-lg shadow-[#3D2B56]/20 transition flex items-center gap-2"
                                    >
                                        <Save size={18} />
                                        {isSavingSettings ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {settingsModal === 'calendar' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><Calendar size={18} className="text-[#3D2B56]" /> ปฏิทินและเวลาเปิด-ปิด</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6">
                            <CalendarView />
                        </div>
                    </div>
                </div>
            )}

            {settingsModal === 'history' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={18} className="text-[#3D2B56]" /> ประวัติการยืม-คืน</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {borrowedItems.length > 0 ? borrowedItems.map((item, idx) => (
                                <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-slate-800">{item.name || `อุปกรณ์ #${item.equipment_id}`}</h4>
                                        <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg ${getBadgeStyle(item.status)}`}>
                                            {item.status === 'returned' ? 'คืนแล้ว' : 'กำลังยืม'}
                                        </span>
                                    </div>
                                    <p className="text-[13px] text-slate-500">ยืมเมื่อ {new Date(item.borrow_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })} • กำหนดคืน {(() => {
                                        const d = new Date(item.borrow_date); d.setDate(d.getDate() + 3); return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                                    })()}</p>
                                </div>
                            )) : (
                                <div className="text-center py-12 text-slate-400">
                                    <ClipboardList size={48} className="mx-auto mb-3 text-slate-200" />
                                    <p>ยังไม่มีประวัติการยืม-คืน</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {settingsModal === 'receipt' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-[#3D2B56]" /> ประวัติใบเสร็จ</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {groupedReceipts.length > 0 ? groupedReceipts.map((group, idx) => (
                                <button key={idx} onClick={() => setSelectedReceipt(group)} className="w-full text-left bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-4 shadow-sm transition">
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="font-bold text-[#3D2B56] text-[15px]">เลขที่: {group.txId}</h4>
                                        <span className="text-[13px] text-slate-500">{group.borrowDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                                    </div>
                                    <div className="space-y-1 mb-4">
                                        {group.items.map((it, i) => (
                                            <p key={i} className="text-[13px] text-slate-600 truncate">- {it.name}</p>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${group.status === 'returned' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {group.status === 'returned' ? 'คืนแล้ว' : 'กำลังยืม'}
                                        </span>
                                        <span className="text-[12px] text-slate-400">{group.items.length} รายการ</span>
                                    </div>
                                </button>
                            )) : (
                                <div className="text-center py-12 text-slate-400">
                                    <FileText size={48} className="mx-auto mb-3 text-slate-200" />
                                    <p>ยังไม่มีใบเสร็จ</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {settingsModal === 'security' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><Lock size={18} className="text-[#3D2B56]" /> ความปลอดภัย (PIN)</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6">
                            <p className="text-[14px] text-slate-600 mb-4">
                                {localStorage.getItem('user_pin') ? 'คุณได้ตั้งรหัส PIN ไว้เรียบร้อยแล้ว' : 'ตั้งรหัส PIN 6 หลักเพื่อเพิ่มความปลอดภัย'}
                            </p>
                            <input 
                                type={isPinVisible ? "text" : "password"}
                                maxLength={6}
                                value={pinCode}
                                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="ใส่รหัส PIN 6 หลัก"
                                className="w-full text-center tracking-[0.5em] text-2xl bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 outline-none focus:border-purple-500 font-mono transition"
                            />
                            <div className="flex justify-between items-center mt-3 mb-6 px-1">
                                <label className="flex items-center gap-2 text-[13px] text-slate-500 cursor-pointer select-none">
                                    <input type="checkbox" checked={isPinVisible} onChange={() => setIsPinVisible(!isPinVisible)} className="accent-purple-600 w-4 h-4" />
                                    แสดงรหัสผ่าน
                                </label>
                                {localStorage.getItem('user_pin') && (
                                    <button onClick={() => { localStorage.removeItem('user_pin'); setPinCode(''); showToast('ยกเลิกการตั้งรหัส PIN สำเร็จ', 'success'); }} className="text-red-500 text-[13px] font-bold hover:underline">
                                        ยกเลิก PIN
                                    </button>
                                )}
                            </div>
                            <button 
                                onClick={() => {
                                    if(pinCode.length === 6) {
                                        localStorage.setItem('user_pin', pinCode);
                                        showToast('ตั้งรหัส PIN สำเร็จ', 'success');
                                        setSettingsModal(null);
                                    } else {
                                        alert('กรุณาใส่รหัส PIN ให้ครบ 6 หลัก');
                                    }
                                }}
                                disabled={pinCode.length !== 6}
                                className={`w-full py-3.5 rounded-2xl font-bold text-[14px] transition flex items-center justify-center gap-2 ${pinCode.length === 6 ? 'bg-[#3D2B56] text-white hover:bg-[#2d1f40] shadow-lg shadow-[#3D2B56]/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                            >
                                <CheckCircle size={18} /> บันทึกรหัส PIN
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {settingsModal === 'guide' && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2"><BookOpen size={18} className="text-[#3D2B56]" /> คู่มือการใช้งานเบื้องต้น</h3>
                            <button onClick={() => setSettingsModal(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4 text-[14px] text-slate-600 leading-relaxed">
                            <h4 className="font-bold text-slate-800 text-[15px]">1. การยืมอุปกรณ์</h4>
                            <p>ไปที่เมนู <strong className="text-[#3D2B56]">"ค้นหา"</strong> เลือกอุปกรณ์ที่ต้องการแล้วกด <strong className="text-[#3D2B56]">"ยืมอุปกรณ์นี้"</strong> จากนั้นอุปกรณ์จะไปอยู่ในตะกร้า ให้ไปที่หน้าตะกร้าเพื่อกดยืนยันการทำรายการ</p>
                            
                            <h4 className="font-bold text-slate-800 text-[15px] mt-4">2. การคืนอุปกรณ์</h4>
                            <p>นำอุปกรณ์มาคืนที่เจ้าหน้าที่ห้องสมุด โดยสามารถโชว์ <strong>QR Code ในหน้าใบเสร็จ</strong> หรือบอกรหัสนักศึกษา เพื่อให้เจ้าหน้าที่ทำรายการคืนให้ในระบบ</p>
                        </div>
                    </div>
                </div>
            )}

            {selectedReceipt && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex flex-col justify-center p-6">
                    <div className="bg-white w-full max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 pb-2 text-center relative border-b border-dashed border-slate-200">
                            <button onClick={() => setSelectedReceipt(null)} className="absolute right-4 top-4 w-8 h-8 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center transition text-slate-500">
                                <X size={18} />
                            </button>
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} className="text-green-600" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 mb-1">ใบเสร็จการยืม</h2>
                            <p className="text-[13px] text-slate-500 mb-4">{selectedReceipt.borrowDate.toLocaleString('th-TH')}</p>
                        </div>
                        <div className="p-6 bg-slate-50 overflow-y-auto">
                            <div className="space-y-4 mb-6">
                                <div className="flex justify-between border-b border-slate-200 pb-3">
                                    <span className="text-[13px] text-slate-500">Transaction ID</span>
                                    <span className="font-bold text-[14px] text-slate-800">{selectedReceipt.txId}</span>
                                </div>
                                <div className="flex justify-between border-b border-slate-200 pb-3">
                                    <span className="text-[13px] text-slate-500">ผู้ยืม</span>
                                    <span className="font-bold text-[14px] text-slate-800">{student?.name_th}</span>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-2xl shadow-sm space-y-3 mb-6">
                                {selectedReceipt.items.map((it, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                                            {it.equipment_img || it.image_url ? (
                                                <img src={`${IMG_BASE}${(it.equipment_img || it.image_url)}`} alt="" className="w-full h-full object-contain" />
                                            ) : (
                                                <Package size={16} className="text-slate-300" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{it.name}</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">รหัส: {it.equipment_id}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-center pb-2">
                                <div className="bg-white p-3 rounded-2xl shadow-sm inline-block border border-slate-100">
                                    <QRCode value={selectedReceipt.txId} size={120} />
                                </div>
                            </div>
                            <p className="text-center text-[12px] text-slate-400 mt-4">แสดง QR Code นี้ให้บรรณารักษ์เมื่อมาคืนอุปกรณ์</p>
                        </div>
                    </div>
                </div>
            )}

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
                                        <img src={`${IMG_BASE}${detailItem.equipment_img}`} alt="" className="max-h-full object-contain" />
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

                                {/* Actions */}
                                {(() => {
                                    if (detailItem.status && detailItem.status !== 'ใช้งานได้') {
                                        return (
                                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                                                <p className="text-[14px] text-slate-500 font-semibold">อุปกรณ์นี้งดให้บริการชั่วคราว ({detailItem.status})</p>
                                            </div>
                                        );
                                    }

                                    const available = detailItem.available_quantity ?? detailItem.total_quantity;
                                    const inQueue = myQueueItems.find(q => q.equipment_id === detailItem.equipment_id);

                                    if (inQueue) {
                                        return (
                                            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center gap-3">
                                                <Timer size={20} className="text-purple-600" />
                                                <p className="text-[14px] text-purple-700 font-semibold">คุณอยู่ในคิวอุปกรณ์นี้แล้ว (ลำดับที่ {inQueue.position})</p>
                                            </div>
                                        );
                                    }

                                    if (available > 0) {
                                        return (
                                            <button onClick={() => {
                                                if (detailItem.status && detailItem.status !== 'ใช้งานได้') {
                                                    showToast(`อุปกรณ์นี้ไม่อยู่ในสถานะพร้อมใช้งาน (${detailItem.status})`, 'warning');
                                                    return;
                                                }
                                                const ok = addToCart(detailItem);
                                                if (ok) {
                                                    setIsDetailOpen(false);
                                                }
                                            }} disabled={isLoading}
                                                className={`w-full py-4 rounded-2xl text-white font-bold text-[15px] bg-[#3D2B56] shadow-lg shadow-[#3D2B56]/20 hover:bg-[#2d1f40] transition ${isLoading ? 'opacity-70' : 'active:scale-[.99]'}`}>
                                                {isLoading ? "กำลังดำเนินการ..." : "หยิบลงตะกร้า"}
                                            </button>
                                        );
                                    } else {
                                        return (
                                            <button onClick={() => handleJoinQueue(detailItem)} disabled={isLoading}
                                                className={`w-full py-4 rounded-2xl text-white font-bold text-[15px] bg-amber-500 shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition ${isLoading ? 'opacity-70' : 'active:scale-[.99]'}`}>
                                                {isLoading ? "กำลังดำเนินการ..." : "จองคิวอุปกรณ์"}
                                            </button>
                                        );
                                    }
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ================= REPORT LOST MODAL ================= */}
            {isLostModalOpen && lostItemTarget && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-orange-50">
                            <div className="flex items-center gap-2 text-orange-800 font-bold text-[16px]">
                                <AlertTriangle size={20} className="text-orange-600" />
                                <span>แจ้งอุปกรณ์สูญหาย / ชำรุด</span>
                            </div>
                            <button onClick={() => { setIsLostModalOpen(false); setLostItemTarget(null); }} className="p-1.5 hover:bg-orange-100 rounded-full transition text-slate-500">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleReportLostSubmit} className="p-6 space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                                <p className="text-[14px] font-bold text-slate-800">{lostItemTarget.name || `อุปกรณ์ #${lostItemTarget.equipment_id}`}</p>
                                <p className="text-[12px] text-slate-500">รหัสอุปกรณ์ {lostItemTarget.equipment_id}</p>
                            </div>

                            <div>
                                <label className="block text-[13px] font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <Calendar size={15} className="text-purple-600" />
                                    วันที่อุปกรณ์หาย (Date of Loss) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={lostDate}
                                    onChange={e => setLostDate(e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-purple-500 transition shadow-sm font-sans"
                                />
                            </div>

                            <div>
                                <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                                    รายละเอียด / เหตุผลที่สูญหาย
                                </label>
                                <textarea
                                    rows={3}
                                    value={lostNote}
                                    onChange={e => setLostNote(e.target.value)}
                                    placeholder="ระบุสถานที่ หรือ รายละเอียดเพิ่มเติม..."
                                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] outline-none focus:border-purple-500 transition shadow-sm"
                                />
                            </div>

                            <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-3 text-[12px] text-orange-800 leading-relaxed">
                                ⚠️ เมื่อกดยืนยันแล้ว สถานะจะถูกเปลี่ยนเป็น "สูญหาย/ชำรุด" และจะมีการบันทึกวันที่หายเข้าสู่ระบบห้องสมุด
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsLostModalOpen(false); setLostItemTarget(null); }}
                                    className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold text-[13.5px] hover:bg-slate-50 transition"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingLost}
                                    className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-[13.5px] shadow-md shadow-orange-600/20 transition"
                                >
                                    {isSubmittingLost ? "กำลังบันทึก..." : "ยืนยันแจ้งสูญหาย"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
