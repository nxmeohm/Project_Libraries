import {
    Bell,
    Check,
    CheckSquare,
    ChevronRight,
    Clock, DollarSign,
    LayoutGrid,
    LogOut,
    Package,
    Search,
    User,
    Users,
    X, Edit3, Trash2, Plus, Eye, Send
} from "lucide-react";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";

/* ============================================================
   Mock data — ตรงกับข้อมูลตัวอย่างในภาพ
   ============================================================ */
const KPI_DATA = [
    { key: "today", label: "ยืมวันนี้", value: "0", icon: CheckSquare, tone: "purple" },
    { key: "returned", label: "คืนแล้วทั้งหมด", value: "2", icon: Check, tone: "green" },
    { key: "overdue", label: "เลยกำหนดคืน", value: "1", icon: Clock, tone: "red" },
    { key: "pending", label: "ผู้ใช้รออนุมัติ", value: "3", icon: User, tone: "amber" },
    { key: "fines", label: "ค่าปรับสะสม (ของชำรุด)", value: "฿35,000", icon: DollarSign, tone: "red" },
];

const CHART_DATA = {
    day: [
        { l: "จ.", v: 12 }, { l: "อ.", v: 18 }, { l: "พ.", v: 9 }, { l: "พฤ.", v: 22 },
        { l: "ศ.", v: 16 }, { l: "ส.", v: 6 }, { l: "อา.", v: 4 },
    ],
    month: [
        { l: "ก.พ.", v: 88 }, { l: "มี.ค.", v: 102 }, { l: "เม.ย.", v: 74 },
        { l: "พ.ค.", v: 130 }, { l: "มิ.ย.", v: 96 }, { l: "ก.ค.", v: 58 },
    ],
    year: [
        { l: "2566", v: 640 }, { l: "2567", v: 812 }, { l: "2568", v: 905 }, { l: "2569", v: 410 },
    ],
};

const RECENT_ACTIVITY = [
    { name: "กิตติศักดิ์ วงศ์ษา", sid: "B6503390", item: "เมาส์ไร้สาย Logitech MX Master 3", borrowed: "21 ก.ค. 69", due: "28 ก.ค. 69", status: "pending" },
    { name: "พิมพ์ชนก แก้วมณี", sid: "B6502211", item: "iPad Air (Gen 5) พร้อมปากกา", borrowed: "20 ก.ค. 69", due: "27 ก.ค. 69", status: "pending" },
    { name: "อภิสิทธิ์ เรืองศรี", sid: "B6512980", item: "พาวเวอร์แบงค์ Anker 20000mAh", borrowed: "20 ก.ค. 69", due: "23 ก.ค. 69", status: "pending" },
    { name: "ณัฐวุฒิ ศรีสุข", sid: "B6501234", item: "หูฟังตัดเสียงรบกวน Sony WH-1000XM5", borrowed: "19 ก.ค. 69", due: "24 ก.ค. 69", status: "borrowed" },
    { name: "ชลธิชา ใจงาม", sid: "B6504456", item: "โปรเจคเตอร์พกพา Epson EF-12", borrowed: "15 ก.ค. 69", due: "18 ก.ค. 69", status: "returned" },
    { name: "สุพัตรา หอมจันทร์", sid: "B6507765", item: "กล้อง Canon EOS M50", borrowed: "12 ก.ค. 69", due: "17 ก.ค. 69", status: "overdue" },
];

const STATUS_MAP = {
    pending: { label: "รออนุมัติ", cls: "bg-amber-500 text-white" },
    borrowed: { label: "กำลังยืม", cls: "bg-purple-600 text-white" },
    returned: { label: "คืนแล้ว", cls: "bg-green-600 text-white" },
    overdue: { label: "เลยกำหนด", cls: "bg-red-600 text-white" },
    rejected: { label: "ยกเลิก", cls: "bg-slate-500 text-white" },
    damaged_lost: { label: "สูญหาย/ชำรุด", cls: "bg-orange-600 text-white" },
    fine_paid: { label: "ชำระค่าปรับแล้ว", cls: "bg-teal-600 text-white" },
};

const KPI_TONE = {
    purple: "bg-purple-100 text-purple-700",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-500",
    amber: "bg-amber-100 text-amber-600",
};

const NAV_ITEMS = [
    { key: "dashboard", label: "แดชบอร์ด", icon: LayoutGrid },
    { key: "requests", label: "คำขอยืม-คืน", icon: CheckSquare },
    { key: "equipment", label: "คลังอุปกรณ์", icon: Package },
    { key: "users", label: "ผู้ใช้งาน / ประวัติ", icon: Users },
    { key: "notify", label: "ประกาศ", icon: Bell },
];

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
        <div className={`fixed top-5 right-5 z-[9999] px-5 py-3 rounded-xl shadow-2xl text-white font-medium text-[14px] flex items-center gap-2 animate-[slideIn_0.3s_ease] ${colors[type] || colors.info}`} style={{animation: 'slideIn 0.3s ease'}}>
            {type === 'success' && <Check size={18} />}
            {type === 'error' && <X size={18} />}
            <span>{message}</span>
            <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
    );
}

/* ============================================================
   authFetch Helper — ส่ง JWT Token ไปกับทุก API Request
   ============================================================ */
const API_BASE = 'http://localhost:5000';
async function authFetch(url, options = {}) {
    const token = sessionStorage.getItem('admin_token');
    const headers = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    if (res.status === 401) {
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_data');
        window.location.href = '/login';
        throw new Error('Session expired');
    }
    return res.json();
}

/* ============================================================
   Component
   ============================================================ */
export default function AdminDashboardScreen({ adminData, onLogout }) {
    const [currentPage, setCurrentPage] = useState("dashboard");
    const [chartRange, setChartRange] = useState("day");
    const [dashboardData, setDashboardData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const showToast = (message, type = 'info') => setToast({ message, type });

    const [requestsData, setRequestsData] = useState([]);
    const [filterStatus, setFilterStatus] = useState("all");
    const [isRequestsLoading, setIsRequestsLoading] = useState(false);

    const fetchRequests = () => {
        setIsRequestsLoading(true);
        authFetch('/api/admin/requests')
            .then(data => {
                if (data.success) {
                    setRequestsData(data.data);
                }
                setIsRequestsLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch requests", err);
                setIsRequestsLoading(false);
            });
    };

    const handleAction = async (id, action, defaultFine = 0) => {
        let fine = 0;
        if (action === 'lost') {
            const amountStr = prompt(`ระบุค่าปรับ (บาท) สำหรับอุปกรณ์สูญหาย/เสียหาย:\n(ราคาประเมินอุปกรณ์: ${defaultFine} บาท)`, defaultFine);
            if (amountStr === null) return;
            fine = parseFloat(amountStr) || 0;
        } else if (action === 'return' && defaultFine > 0) {
            if (!confirm(`นักศึกษามีค่าปรับล่าช้า ${defaultFine} บาท ชำระเงินเรียบร้อยแล้วใช่หรือไม่?\nกด OK เพื่อยืนยันรับคืนและบันทึกยอดค่าปรับ`)) return;
            fine = defaultFine;
        } else {
            if (!confirm(`ยืนยันการดำเนินการ?`)) return;
        }

        try {
            const data = await authFetch('/api/admin/update-request', {
                method: "POST",
                body: JSON.stringify({ id, action, fine })
            });
            if (data.success) {
                showToast('อัปเดตสถานะเรียบร้อยแล้ว', 'success');
                fetchRequests();
            } else {
                showToast(data.message || 'ไม่สามารถอัปเดตสถานะได้', 'error');
            }
        } catch (err) {
            console.error("Error updating status", err);
            showToast('เกิดข้อผิดพลาดในการอัปเดต', 'error');
        }
    };

    const [equipmentsData, setEquipmentsData] = useState([]);
    const [isEquipmentsLoading, setIsEquipmentsLoading] = useState(false);

    // Users state
    const [usersData, setUsersData] = useState([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [selectedUser, setSelectedUser] = useState(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);

    // Notifications state
    const [notificationsData, setNotificationsData] = useState([]);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
    const [newNotification, setNewNotification] = useState({
        target: "all",
        title: "",
        message: ""
    });

    // User Modal History state
    const [modalUserHistory, setModalUserHistory] = useState([]);
    const [isModalHistoryLoading, setIsModalHistoryLoading] = useState(false);
    const [modalHistorySearchDate, setModalHistorySearchDate] = useState("");

    const fetchUserHistoryForModal = async (studentId) => {
        setIsModalHistoryLoading(true);
        try {
            const data = await authFetch(`/api/admin/user-history/${studentId}`);
            if (data.success) {
                setModalUserHistory(data.data.history);
            } else {
                setModalUserHistory([]);
            }
        } catch (error) {
            console.error(error);
            setModalUserHistory([]);
        } finally {
            setIsModalHistoryLoading(false);
        }
    };

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newEquip, setNewEquip] = useState({
        name: "", kit_code: "", category: "อุปกรณ์อิเล็กทรอนิกส์",
        total_quantity: 1, available_quantity: 1, borrow_days: 7,
        price: 0, description: "", status: "ใช้งานได้"
    });

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editEquip, setEditEquip] = useState(null);
    const [inventorySearch, setInventorySearch] = useState("");

    const fetchEquipments = () => {
        setIsEquipmentsLoading(true);
        authFetch('/api/admin/equipments')
            .then(data => {
                if (data.success) {
                    setEquipmentsData(data.data);
                } else if (Array.isArray(data)) {
                    setEquipmentsData(data);
                }
                setIsEquipmentsLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch equipments", err);
                setIsEquipmentsLoading(false);
            });
    };

    const fetchUsers = () => {
        setIsUsersLoading(true);
        authFetch('/api/admin/users')
            .then(data => {
                if (data.success) {
                    setUsersData(data.data);
                } else if (Array.isArray(data)) {
                    setUsersData(data);
                }
                setIsUsersLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch users", err);
                setIsUsersLoading(false);
            });
    };

    const [imageFile, setImageFile] = useState(null);

    const handleSaveEquipment = async () => {
        if (!newEquip.name || !newEquip.kit_code) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
        try {
            const formData = new FormData();
            Object.keys(newEquip).forEach(key => formData.append(key, newEquip[key]));
            if (imageFile) {
                formData.append('equipment_img', imageFile);
            }

            const data = await authFetch('/api/admin/equipments', {
                method: "POST",
                body: formData
            });
            if (data.success) {
                showToast('เพิ่มอุปกรณ์สำเร็จ', 'success');
                setIsAddModalOpen(false);
                setNewEquip({
                    name: "", kit_code: "", category: "อุปกรณ์อิเล็กทรอนิกส์",
                    total_quantity: 1, available_quantity: 1, borrow_days: 7,
                    price: 0, description: "", status: "ใช้งานได้"
                });
                setImageFile(null);
                fetchEquipments();
            } else {
                showToast('เกิดข้อผิดพลาด: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    const [editImageFile, setEditImageFile] = useState(null);

    const handleUpdateEquipment = async () => {
        if (!editEquip.name || !editEquip.kit_code) return showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
        try {
            const formData = new FormData();
            Object.keys(editEquip).forEach(key => formData.append(key, editEquip[key]));
            if (editImageFile) {
                formData.append('equipment_img', editImageFile);
            }

            const data = await authFetch(`/api/admin/equipments/${editEquip.equipment_id}`, {
                method: "PUT",
                body: formData
            });
            if (data.success) {
                showToast('แก้ไขอุปกรณ์สำเร็จ', 'success');
                setIsEditModalOpen(false);
                setEditEquip(null);
                setEditImageFile(null);
                fetchEquipments();
            } else {
                showToast('เกิดข้อผิดพลาด: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    const handleDeleteEquipment = async (id) => {
        if (!window.confirm("คุณต้องการลบอุปกรณ์นี้ใช่หรือไม่?")) return;
        try {
            const data = await authFetch(`/api/admin/equipments/${id}`, {
                method: "DELETE"
            });
            if (data.success) {
                showToast('ลบอุปกรณ์สำเร็จ', 'success');
                fetchEquipments();
            } else {
                showToast('ไม่สามารถลบได้: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    const fetchNotifications = () => {
        setIsNotificationsLoading(true);
        authFetch('/api/admin/notifications')
            .then(data => {
                if (data.success) {
                    setNotificationsData(data.data);
                }
                setIsNotificationsLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch notifications", err);
                setIsNotificationsLoading(false);
            });
    };

    const handleSendNotification = async () => {
        if (!newNotification.title || !newNotification.message) return showToast('กรุณากรอกหัวข้อและข้อความให้ครบถ้วน', 'warning');
        try {
            const data = await authFetch('/api/admin/notifications', {
                method: "POST",
                body: JSON.stringify(newNotification)
            });
            if (data.success) {
                showToast('ส่งการแจ้งเตือนสำเร็จ', 'success');
                setNewNotification({ target: "all", title: "", message: "" });
                fetchNotifications();
            } else {
                showToast('เกิดข้อผิดพลาด: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

    useEffect(() => {
        if (currentPage === "dashboard") {
            setIsLoading(true);
            authFetch('/api/admin/dashboard')
                .then(data => {
                    if (data.success) {
                        setDashboardData(data.data);
                    }
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch dashboard data", err);
                    setIsLoading(false);
                });
        } else if (currentPage === "requests") {
            fetchRequests();
        } else if (currentPage === "equipment") {
            fetchEquipments();
        } else if (currentPage === "users") {
            fetchUsers();
        } else if (currentPage === "notify") {
            fetchNotifications();
        }
    }, [currentPage]);

    // Socket.IO for real-time updates
    useEffect(() => {
        const socket = io(API_BASE);
        socket.on('data_updated', () => {
            console.log("Real-time update received!");
            // Re-fetch data for the current active view
            if (currentPage === "dashboard") {
                authFetch('/api/admin/dashboard').then(data => { if (data.success) setDashboardData(data.data); }).catch(console.error);
            } else if (currentPage === "requests") {
                fetchRequests();
            } else if (currentPage === "equipment") {
                fetchEquipments();
            } else if (currentPage === "users") {
                fetchUsers();
            } else if (currentPage === "notify") {
                fetchNotifications();
            }
        });

        return () => {
            socket.off('data_updated');
            socket.disconnect();
        };
    }, [currentPage]);

    const activeChartSource = dashboardData?.chartData || CHART_DATA;
    const chartData = activeChartSource[chartRange];
    const maxVal = Math.max(...chartData.map((d) => d.v), 5);

    const currentKpiData = dashboardData ? [
        { key: "today", label: "ยืมวันนี้", value: dashboardData.kpi.today.toString(), icon: CheckSquare, tone: "purple" },
        { key: "returned", label: "คืนแล้วทั้งหมด", value: dashboardData.kpi.returned.toString(), icon: Check, tone: "green" },
        { key: "overdue", label: "เลยกำหนดคืน", value: dashboardData.kpi.overdue.toString(), icon: Clock, tone: "red" },
        { key: "pending", label: "ผู้ใช้รออนุมัติ", value: dashboardData.kpi.pending.toString(), icon: User, tone: "amber" },
        { key: "fines", label: "ค่าปรับสะสม", value: `฿${(dashboardData.kpi.fines || 0).toLocaleString()}`, icon: DollarSign, tone: "red" },
    ] : KPI_DATA;

    const formatThaiDate = (dateString) => {
        if (!dateString) return "-";
        const date = new Date(dateString);
        return date.toLocaleDateString('th-TH', { year: '2-digit', month: 'short', day: 'numeric' });
    };

    const currentRecentActivity = dashboardData ? dashboardData.recent_activity.map(a => ({
        name: a.student_name,
        sid: a.student_id,
        item: a.equipment_name,
        borrowed: formatThaiDate(a.borrow_date),
        due: formatThaiDate(a.return_date),
        status: a.status
    })) : RECENT_ACTIVITY;

    const filteredRequests = requestsData.filter(r => filterStatus === "all" || r.status === filterStatus);

    const filteredModalHistory = modalUserHistory.filter(h => {
        if (!modalHistorySearchDate) return true;
        const s = modalHistorySearchDate.toLowerCase();
        const b = formatThaiDate(h.borrow_date).toLowerCase();
        const r = h.return_date ? formatThaiDate(h.return_date).toLowerCase() : "-";
        const n = h.equipment_name ? h.equipment_name.toLowerCase() : "";
        return b.includes(s) || r.includes(s) || n.includes(s);
    });

    return (
        <div className="min-h-screen bg-purple-50 flex font-sans">
            {/* ================= TOAST ================= */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
            {/* ================= SIDEBAR ================= */}
            <div className="w-[236px] shrink-0 bg-[#3D2B56] text-white p-4 flex flex-col sticky top-0 h-screen">
                <div className="flex items-center px-2 pt-0 pb-2 justify-center">
                    <img src="/logo.png" alt="Libraries SUT" className="h-28 object-contain" />
                </div>

                <div className="flex flex-col gap-1 flex-1">
                    {NAV_ITEMS.map((item) => {
                        const active = currentPage === item.key;
                        const Icon = item.icon;

                        let badgeCount = null;
                        if (item.key === "requests" && dashboardData?.kpi?.pending > 0) {
                            badgeCount = dashboardData.kpi.pending;
                        }

                        return (
                            <button
                                key={item.key}
                                onClick={() => setCurrentPage(item.key)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition text-left ${active ? "bg-white/15 text-white font-semibold" : "text-purple-300 hover:bg-white/5 hover:text-white"
                                    }`}
                            >
                                <Icon size={18} className="shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                {badgeCount && (
                                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono">
                                        {badgeCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="border-t border-white/10 pt-3.5 flex items-center gap-2.5">
                    <div className="w-8.5 h-8.5 w-[34px] h-[34px] rounded-full bg-white/15 flex items-center justify-center font-bold text-[13px] shrink-0">A</div>
                    <div className="text-[12.5px] leading-tight">
                        <div>เจ้าหน้าที่บรรณสาร</div>
                        <div className="text-[10.5px] text-purple-300">admin@library.ac.th</div>
                    </div>
                    <button onClick={onLogout} className="ml-auto w-[30px] h-[30px] rounded-lg bg-white/10 hover:bg-white/20 text-purple-300 hover:text-white flex items-center justify-center shrink-0 transition">
                        <LogOut size={15} />
                    </button>
                </div>
            </div>

            {/* ================= MAIN ================= */}
            <div className="flex-1 min-w-0">
                {currentPage === "dashboard" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-semibold">แดชบอร์ดภาพรวม</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">สรุปการยืม-คืนอุปกรณ์บรรณสารทั้งหมด</p>
                        </div>

                        <div className="p-8 pt-6">
                            {/* KPI cards */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                                {currentKpiData.map((kpi) => {
                                    const Icon = kpi.icon;
                                    return (
                                        <div key={kpi.key} className="bg-white border border-purple-100 rounded-3xl p-4.5 p-[18px] shadow-sm">
                                            <div className={`w-9.5 h-9.5 w-[38px] h-[38px] rounded-xl flex items-center justify-center mb-2.5 ${KPI_TONE[kpi.tone]}`}>
                                                <Icon size={19} />
                                            </div>
                                            <div className="text-2xl font-bold">{kpi.value}</div>
                                            <div className="text-[12.5px] text-slate-400 mt-0.5">{kpi.label}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Chart panel */}
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-5 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[15.5px] font-semibold">แนวโน้มการยืมอุปกรณ์</h3>
                                    <div className="flex bg-purple-50 rounded-lg p-0.5 gap-0.5">
                                        {[["day", "รายวัน"], ["month", "รายเดือน"], ["year", "รายปี"]].map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => setChartRange(key)}
                                                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition ${chartRange === key ? "bg-purple-700 text-white" : "text-slate-400 hover:text-purple-700"
                                                    }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-end gap-3.5 h-[180px] px-1">
                                    {chartData.map((d, i) => (
                                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                                            <span className="text-[10.5px] font-bold text-purple-700">{d.v}</span>
                                            <div
                                                className="w-full max-w-[34px] rounded-t-lg rounded-b-sm bg-gradient-to-b from-purple-500 to-purple-700 transition-all duration-300"
                                                style={{ height: `${Math.max(6, Math.round((d.v / maxVal) * 100))}%` }}
                                            />
                                            <span className="text-[11px] text-slate-400">{d.l}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recent activity table */}
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[15.5px] font-semibold">กิจกรรมล่าสุด</h3>
                                    <button
                                        onClick={() => setCurrentPage("requests")}
                                        className="text-[12.5px] font-semibold text-purple-700 flex items-center gap-1 hover:gap-1.5 transition-all"
                                    >
                                        ดูทั้งหมด <ChevronRight size={14} />
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr>
                                                {["นักศึกษา", "อุปกรณ์", "วันที่ยืม", "กำหนดคืน", "สถานะ"].map((h) => (
                                                    <th key={h} className="text-left text-[11.5px] uppercase tracking-wide text-slate-400 font-bold pb-3 border-b-2 border-purple-100 whitespace-nowrap px-3 first:pl-0">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentRecentActivity.length > 0 ? currentRecentActivity.map((r, i) => (
                                                <tr key={i} className="hover:bg-purple-50 transition">
                                                    <td className="py-3.5 px-3 first:pl-0 border-b border-purple-100">
                                                        <div className="font-semibold text-[13.5px]">{r.name}</div>
                                                        <div className="text-[11.5px] text-slate-400">{r.sid}</div>
                                                    </td>
                                                    <td className="py-3.5 px-3 text-[13px] border-b border-purple-100 whitespace-nowrap">{r.item}</td>
                                                    <td className="py-3.5 px-3 text-[13px] border-b border-purple-100 whitespace-nowrap">{r.borrowed}</td>
                                                    <td className="py-3.5 px-3 text-[13px] border-b border-purple-100 whitespace-nowrap">{r.due}</td>
                                                    <td className="py-3.5 px-3 border-b border-purple-100">
                                                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_MAP[r.status]?.cls || 'bg-slate-100 text-slate-600'}`}>
                                                            {STATUS_MAP[r.status]?.label || r.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="5" className="py-8 text-center text-slate-400 text-sm">ไม่มีข้อมูลการยืมล่าสุด</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                ) : currentPage === "requests" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-semibold">คำขอยืม-คืน และสถานะ</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">อนุมัติคำขอยืม และติดตามสถานะการคืนอุปกรณ์</p>
                        </div>
                        <div className="p-8 pt-6">
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-6">
                                {/* Filters */}
                                <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
                                    {[
                                        { id: "all", label: "ทั้งหมด" },
                                        { id: "pending", label: "รออนุมัติ" },
                                        { id: "borrowed", label: "กำลังยืม" },
                                        { id: "overdue", label: "เลยกำหนด" },
                                        { id: "returned", label: "คืนแล้ว" }
                                    ].map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => setFilterStatus(f.id)}
                                            className={`px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition ${filterStatus === f.id ? "bg-purple-700 text-white shadow-md shadow-purple-200" : "bg-purple-50 text-purple-700 hover:bg-purple-100"}`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse min-w-[800px]">
                                        <thead>
                                            <tr>
                                                {["รหัสนศ.", "ชื่อ-นามสกุล", "อุปกรณ์", "วันที่ขอ", "กำหนดคืน", "ค่าปรับ", "สถานะ", "การจัดการ"].map((h) => (
                                                    <th key={h} className="text-left text-[11.5px] uppercase tracking-wide text-slate-400 font-bold pb-4 border-b-2 border-purple-100 whitespace-nowrap px-4 first:pl-2">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isRequestsLoading ? (
                                                <tr><td colSpan="8" className="py-8 text-center text-slate-400 text-sm">กำลังโหลดข้อมูล...</td></tr>
                                            ) : filteredRequests.length > 0 ? filteredRequests.map((r) => (
                                                <tr key={r.id} className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0">
                                                    <td className="py-4 px-4 first:pl-2 text-[13px] font-medium">{r.student_id}</td>
                                                    <td className="py-4 px-4 text-[13px] font-semibold">{r.student_name}</td>
                                                    <td className="py-4 px-4">
                                                        <div className="text-[13px] font-medium">{r.equipment_name}</div>
                                                        <div className="text-[11px] text-slate-400">{r.equipment_code}</div>
                                                    </td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{formatThaiDate(r.borrow_date)}</td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{formatThaiDate(r.return_date)}</td>
                                                    <td className="py-4 px-4 text-[13px] font-semibold">
                                                        {r.fine_amount > 0 ? (
                                                            <span className="text-red-500">{r.fine_amount} บ.</span>
                                                        ) : (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_MAP[r.status]?.cls || 'bg-slate-100 text-slate-600'}`}>
                                                            {STATUS_MAP[r.status]?.label || r.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        {r.status === "pending" && (
                                                            <div className="flex gap-2">
                                                                <button onClick={() => handleAction(r.id, 'approve')} className="w-8 h-8 rounded-lg border border-purple-200 text-purple-600 flex items-center justify-center hover:bg-purple-50 transition">
                                                                    <Check size={16} />
                                                                </button>
                                                                <button onClick={() => handleAction(r.id, 'reject')} className="w-8 h-8 rounded-lg border border-red-200 text-red-500 flex items-center justify-center hover:bg-red-50 transition">
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                        )}
                                                        {(r.status === "borrowed" || r.status === "overdue") && (
                                                            <div className="flex flex-col gap-2 items-start">
                                                                <button onClick={() => handleAction(r.id, 'return', r.fine_amount)} className="text-[12px] font-semibold text-purple-700 hover:text-purple-900 transition">
                                                                    ตรวจสอบ & บันทึกคืน
                                                                </button>
                                                                <button onClick={() => handleAction(r.id, 'lost', r.price)} className="text-[12px] font-semibold text-red-500 hover:text-red-700 transition">
                                                                    แจ้งสูญหาย/เสียหาย
                                                                </button>
                                                            </div>
                                                        )}
                                                        {r.status === "damaged_lost" && (
                                                            <button onClick={() => handleAction(r.id, 'fine_paid')} className="text-[12px] font-semibold text-green-600 hover:text-green-800 transition">
                                                                ชำระค่าปรับแล้ว
                                                            </button>
                                                        )}
                                                        {(r.status === "returned" || r.status === "rejected" || r.status === "fine_paid") && (
                                                            <span className="text-slate-300">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan="8" className="py-8 text-center text-slate-400 text-sm">ไม่พบข้อมูลคำขอ</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                ) : currentPage === "equipment" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex justify-between items-center">
                            <div>
                                <h1 className="text-xl font-semibold">คลังอุปกรณ์</h1>
                                <p className="text-[12.5px] text-slate-400 mt-0.5">เพิ่ม แก้ไข หรือลบรายการอุปกรณ์ในระบบ</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(true)} className="bg-purple-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md hover:bg-purple-800 transition">
                                <Plus size={16} /> เพิ่มอุปกรณ์
                            </button>
                        </div>
                        <div className="p-8 pt-6">
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-6">
                                <div className="mb-6">
                                    <div className="relative">
                                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="ค้นหาชื่ออุปกรณ์หรือรหัส..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[13.5px] outline-none focus:border-purple-400 focus:bg-white transition"
                                            value={inventorySearch}
                                            onChange={e => setInventorySearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse min-w-[800px]">
                                        <thead>
                                            <tr>
                                                {["อุปกรณ์", "รหัส", "หมวดหมู่", "สถานะ", "คงเหลือ/ทั้งหมด", "ยืมได้ (วัน)", "ราคา / ค่าปรับ", "การจัดการ"].map((h) => (
                                                    <th key={h} className="text-left text-[11.5px] uppercase tracking-wide text-slate-400 font-bold pb-4 border-b-2 border-purple-100 whitespace-nowrap px-4 first:pl-2">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isEquipmentsLoading ? (
                                                <tr><td colSpan="8" className="py-8 text-center text-slate-400 text-sm">กำลังโหลดข้อมูล...</td></tr>
                                            ) : equipmentsData.filter(eq => eq.name.includes(inventorySearch) || eq.kit_code?.includes(inventorySearch)).map((eq) => (
                                                <tr key={eq.equipment_id} className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0">
                                                    <td className="py-4 px-4 first:pl-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 overflow-hidden">
                                                                {eq.equipment_img ? (
                                                                    <img src={`${API_BASE}/${eq.equipment_img}`} alt={eq.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Package size={20} />
                                                                )}
                                                            </div>
                                                            <div className="text-[13px] font-semibold text-slate-700">{eq.name}</div>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{eq.kit_code || '-'}</td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{eq.category || 'อุปกรณ์ทั่วไป'}</td>
                                                    <td className="py-4 px-4 whitespace-nowrap">
                                                        <span className={`px-3 py-1 rounded-full text-[11.5px] font-bold ${eq.status === 'ใช้งานได้' ? 'bg-green-100 text-green-700' :
                                                                eq.status === 'กำลังซ่อมแซม' ? 'bg-orange-100 text-orange-700' :
                                                                    eq.status === 'งดใช้ชั่วคราว' ? 'bg-red-100 text-red-700' :
                                                                        'bg-slate-100 text-slate-700'
                                                            }`}>
                                                            {eq.status || 'ใช้งานได้'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4 text-[13px] font-medium text-slate-700">{eq.available_quantity}/{eq.total_quantity}</td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{eq.borrow_days || 7}</td>
                                                    <td className="py-4 px-4">
                                                        <div className="text-[13px] font-semibold">฿{eq.price}</div>
                                                        <div className="text-[11px] text-slate-400">ค่าปรับวัน ฿{eq.price * 2}</div>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { setEditEquip(eq); setIsEditModalOpen(true); }} className="w-8 h-8 rounded-lg border border-purple-200 text-purple-600 flex items-center justify-center hover:bg-purple-50 transition">
                                                                <Edit3 size={15} />
                                                            </button>
                                                            <button onClick={() => handleDeleteEquipment(eq.equipment_id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-500 flex items-center justify-center hover:bg-red-50 transition">
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Modal */}
                        {isAddModalOpen && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                                <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
                                    <div className="flex items-center justify-between p-6 border-b border-purple-50 sticky top-0 bg-white/90 backdrop-blur z-10">
                                        <h2 className="text-xl font-bold text-slate-700">เพิ่มอุปกรณ์ใหม่</h2>
                                        <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center hover:bg-purple-100 transition">
                                            <X size={18} />
                                        </button>
                                    </div>
                                    <div className="p-6 space-y-5">
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รูปภาพอุปกรณ์ (ถ้ามี)</label>
                                            <input type="file" accept="image/*" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                onChange={e => setImageFile(e.target.files[0])} />
                                            {imageFile && (
                                                <div className="mt-4 flex justify-center">
                                                    <div className="w-32 h-32 rounded-2xl overflow-hidden border border-purple-100 shadow-sm bg-purple-50 flex items-center justify-center">
                                                        <img src={URL.createObjectURL(imageFile)} alt="Preview" className="w-full h-full object-cover" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ชื่ออุปกรณ์</label>
                                            <input type="text" placeholder="เช่น iPad Air (Gen 5)" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={newEquip.name} onChange={e => setNewEquip({ ...newEquip, name: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รหัสครุภัณฑ์</label>
                                                <div className="flex w-full bg-slate-50 border border-purple-100 rounded-xl overflow-hidden focus-within:border-purple-400">
                                                    <span className="bg-slate-200/50 text-slate-500 font-bold px-4 py-3 border-r border-purple-100 flex items-center justify-center">Kit</span>
                                                    <input type="text" placeholder="XXXX" className="w-full bg-transparent px-4 py-3 text-[14px] outline-none"
                                                        value={newEquip.kit_code.replace(/^Kit /i, '')} onChange={e => setNewEquip({ ...newEquip, kit_code: `Kit ${e.target.value}` })} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">หมวดหมู่</label>
                                                <select className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={newEquip.category} onChange={e => setNewEquip({ ...newEquip, category: e.target.value })}>
                                                    <option>อุปกรณ์อิเล็กทรอนิกส์</option>
                                                    <option>อุปกรณ์เสริม</option>
                                                    <option>อุปกรณ์ชาร์จ</option>
                                                    <option>อุปกรณ์ทั่วไป</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">สถานะ</label>
                                                <select className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={newEquip.status} onChange={e => setNewEquip({ ...newEquip, status: e.target.value })}>
                                                    <option>ใช้งานได้</option>
                                                    <option>กำลังซ่อมแซม</option>
                                                    <option>งดใช้ชั่วคราว</option>
                                                    <option>อื่นๆ</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">จำนวนทั้งหมด</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={newEquip.total_quantity} onChange={e => setNewEquip({ ...newEquip, total_quantity: parseInt(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">คงเหลือ</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={newEquip.available_quantity} onChange={e => setNewEquip({ ...newEquip, available_quantity: parseInt(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ยืมได้ (วัน)</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={newEquip.borrow_days} onChange={e => setNewEquip({ ...newEquip, borrow_days: parseInt(e.target.value) })} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ราคาสินค้า (บาท) — ใช้คำนวณค่าปรับกรณีชำรุด</label>
                                            <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={newEquip.price} onChange={e => setNewEquip({ ...newEquip, price: parseFloat(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รายละเอียด</label>
                                            <textarea placeholder="คำอธิบายสั้นๆ เกี่ยวกับอุปกรณ์" rows="3" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={newEquip.description} onChange={e => setNewEquip({ ...newEquip, description: e.target.value })}></textarea>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-4">
                                            <button onClick={() => setIsAddModalOpen(false)} className="w-full py-3.5 rounded-xl border border-purple-100 text-purple-900 font-bold text-[14px] hover:bg-slate-50 transition">
                                                ยกเลิก
                                            </button>
                                            <button onClick={handleSaveEquipment} className="w-full py-3.5 rounded-xl bg-purple-900 text-white font-bold text-[14px] shadow-lg shadow-purple-900/30 hover:bg-purple-800 transition">
                                                บันทึก
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Edit Equipment Modal */}
                        {isEditModalOpen && editEquip && (
                            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                                    <div className="px-8 py-5 border-b border-purple-100 flex justify-between items-center bg-purple-50">
                                        <h3 className="font-bold text-[16px] text-purple-900 flex items-center gap-2">
                                            <Edit3 size={18} /> แก้ไขอุปกรณ์
                                        </h3>
                                        <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-red-500 transition">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className="p-8 space-y-5 overflow-y-auto">
                                        {/* แสดงรูปภาพอุปกรณ์ */}
                                        {(editEquip.equipment_img || editImageFile) && (
                                            <div className="flex justify-center mb-6 mt-[-10px]">
                                                <div className="w-32 h-32 rounded-2xl overflow-hidden border border-purple-100 shadow-sm bg-purple-50 flex items-center justify-center">
                                                    <img src={editImageFile ? URL.createObjectURL(editImageFile) : `${API_BASE}/${editEquip.equipment_img}`} alt={editEquip.name} className="w-full h-full object-cover" />
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">เปลี่ยนรูปภาพใหม่ (ถ้าต้องการ)</label>
                                            <input type="file" accept="image/*" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                onChange={e => setEditImageFile(e.target.files[0])} />
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ชื่ออุปกรณ์</label>
                                            <input type="text" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={editEquip.name} onChange={e => setEditEquip({ ...editEquip, name: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รหัสอุปกรณ์ (Kit Code)</label>
                                                <div className="flex w-full bg-slate-50 border border-purple-100 rounded-xl overflow-hidden focus-within:border-purple-400">
                                                    <span className="bg-slate-200/50 text-slate-500 font-bold px-4 py-3 border-r border-purple-100 flex items-center justify-center">Kit</span>
                                                    <input type="text" className="w-full bg-transparent px-4 py-3 text-[14px] outline-none"
                                                        value={(editEquip.kit_code || '').replace(/^Kit /i, '')} onChange={e => setEditEquip({ ...editEquip, kit_code: `Kit ${e.target.value}` })} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">หมวดหมู่</label>
                                                <select className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={editEquip.category} onChange={e => setEditEquip({ ...editEquip, category: e.target.value })}>
                                                    <option>อุปกรณ์อิเล็กทรอนิกส์</option>
                                                    <option>อุปกรณ์เสริม</option>
                                                    <option>อุปกรณ์ชาร์จ</option>
                                                    <option>อุปกรณ์ทั่วไป</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">สถานะ</label>
                                                <select className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={editEquip.status} onChange={e => setEditEquip({ ...editEquip, status: e.target.value })}>
                                                    <option>ใช้งานได้</option>
                                                    <option>กำลังซ่อมแซม</option>
                                                    <option>งดใช้ชั่วคราว</option>
                                                    <option>อื่นๆ</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">จำนวนทั้งหมด</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={editEquip.total_quantity} onChange={e => setEditEquip({ ...editEquip, total_quantity: parseInt(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">คงเหลือ</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={editEquip.available_quantity} onChange={e => setEditEquip({ ...editEquip, available_quantity: parseInt(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ยืมได้ (วัน)</label>
                                                <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                    value={editEquip.borrow_days} onChange={e => setEditEquip({ ...editEquip, borrow_days: parseInt(e.target.value) })} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ราคาสินค้า (บาท)</label>
                                            <input type="number" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={editEquip.price} onChange={e => setEditEquip({ ...editEquip, price: parseFloat(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รายละเอียด</label>
                                            <textarea rows="3" className="w-full bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400"
                                                value={editEquip.description} onChange={e => setEditEquip({ ...editEquip, description: e.target.value })}></textarea>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 pt-4">
                                            <button onClick={() => setIsEditModalOpen(false)} className="w-full py-3.5 rounded-xl border border-purple-100 text-purple-900 font-bold text-[14px] hover:bg-slate-50 transition">
                                                ยกเลิก
                                            </button>
                                            <button onClick={handleUpdateEquipment} className="w-full py-3.5 rounded-xl bg-purple-900 text-white font-bold text-[14px] shadow-lg shadow-purple-900/30 hover:bg-purple-800 transition">
                                                บันทึกการแก้ไข
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </>
                ) : currentPage === "users" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex justify-between items-center">
                            <div>
                                <h1 className="text-xl font-semibold">ผู้ใช้งานระบบ</h1>
                                <p className="text-[12.5px] text-slate-400 mt-0.5">จัดการบัญชีนักศึกษาและอนุมัติผู้ที่ต้องการยืมอุปกรณ์</p>
                            </div>
                            <div className="relative flex items-center">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ หรือ รหัสนศ."
                                    className="pl-9 pr-10 py-2 bg-slate-50 border border-purple-100 rounded-xl text-[13px] focus:outline-none focus:border-purple-300 w-64 transition-colors"
                                    value={userSearchQuery}
                                    onChange={(e) => setUserSearchQuery(e.target.value)}
                                />
                                {userSearchQuery && (
                                    <button
                                        onClick={() => setUserSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700 rounded-full focus:outline-none transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="p-8 pt-6">
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-6">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse min-w-[800px]">
                                        <thead>
                                            <tr>
                                                {["รหัสนศ.", "ชื่อ-นามสกุล", "สาขาวิชา", "สถานะบัญชี"].map((h) => (
                                                    <th key={h} className="text-left text-[11.5px] uppercase tracking-wide text-slate-400 font-bold pb-4 border-b-2 border-purple-100 whitespace-nowrap px-4 first:pl-2">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {isUsersLoading ? (
                                                <tr><td colSpan="4" className="py-8 text-center text-slate-400 text-sm">กำลังโหลดข้อมูล...</td></tr>
                                            ) : usersData.length > 0 ? usersData.filter((u) => u.student_id.toLowerCase().includes(userSearchQuery.toLowerCase()) || (u.name_th && u.name_th.toLowerCase().includes(userSearchQuery.toLowerCase()))).map((user) => {
                                                const statusMap = {
                                                    'active': { label: 'ใช้งานได้', cls: 'bg-green-100 text-green-700' },
                                                    'suspended': { label: 'ระงับ', cls: 'bg-red-100 text-red-600' },
                                                    'graduated': { label: 'รออนุมัติ', cls: 'bg-amber-100 text-amber-700' }
                                                };
                                                const status = statusMap[user.education_status] || { label: user.education_status, cls: 'bg-slate-100 text-slate-600' };

                                                return (
                                                    <tr
                                                        key={user.student_id}
                                                        className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0 cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            fetchUserHistoryForModal(user.student_id);
                                                            setIsUserModalOpen(true);
                                                        }}
                                                    >
                                                        <td className="py-4 px-4 first:pl-2 text-[13px] font-medium text-slate-700">{user.student_id}</td>
                                                        <td className="py-4 px-4 text-[13px] font-semibold text-slate-700">{user.name_th}</td>
                                                        <td className="py-4 px-4 text-[13px] text-slate-600">{user.department}</td>
                                                        <td className="py-4 px-4">
                                                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${status.cls}`}>
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            }) : (
                                                <tr><td colSpan="4" className="py-8 text-center text-slate-400 text-sm">ไม่มีข้อมูลผู้ใช้งาน</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* User Detail Modal */}
                        {isUserModalOpen && selectedUser && (
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-3xl w-full max-w-6xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
                                        <h3 className="text-lg font-bold text-slate-800">ข้อมูลส่วนตัว</h3>
                                        <button onClick={() => setIsUserModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                            <X className="w-5 h-5 text-slate-500" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
                                        <div className="p-6 space-y-2 w-full md:w-[35%] shrink-0 md:border-r border-b md:border-b-0 border-slate-100 bg-white">
                                        <div className="flex flex-col items-center mb-6">
                                            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-3 shadow-inner overflow-hidden">
                                                {selectedUser.student_img ? (
                                                    <img src={`http://localhost/${selectedUser.student_img}`} alt={selectedUser.name_th} className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={40} />
                                                )}
                                            </div>
                                            <h2 className="text-xl font-bold text-slate-800">{selectedUser.name_th}</h2>
                                            <p className="text-slate-500 text-[13px]">{selectedUser.student_id}</p>
                                        </div>

                                        <div className="flex flex-col space-y-4">
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                                <span className="text-slate-500 text-[13px]">สาขาวิชา:</span>
                                                <span className="text-slate-800 font-medium text-[13px]">{selectedUser.department || "-"}</span>
                                            </div>
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                                <span className="text-slate-500 text-[13px]">อีเมล:</span>
                                                <span className="text-slate-800 font-medium text-[13px]">{selectedUser.email || "-"}</span>
                                            </div>
                                            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                                                <span className="text-slate-500 text-[13px]">เบอร์โทร:</span>
                                                <span className="text-slate-800 font-medium text-[13px]">{selectedUser.phone || "-"}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-500 text-[13px]">สถานะ:</span>
                                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${selectedUser.education_status === 'active' ? 'bg-green-100 text-green-700' :
                                                        selectedUser.education_status === 'suspended' ? 'bg-red-100 text-red-600' :
                                                            'bg-slate-100 text-slate-600'
                                                    }`}>
                                                    {selectedUser.education_status === 'active' ? 'กำลังศึกษา' :
                                                        selectedUser.education_status === 'suspended' ? 'ระงับ' :
                                                            selectedUser.education_status || 'ไม่ทราบ'}
                                                </span>
                                            </div>
                                        </div>
                                        </div>
                                        <div className="bg-slate-50 p-6 flex-1 w-full md:w-[65%]">
                                            <div className="flex justify-between items-center mb-4 gap-4">
                                                <h4 className="text-sm font-bold text-slate-800">ประวัติการยืม-คืน</h4>
                                                <div className="relative">
                                                    <input 
                                                        type="text" 
                                                        placeholder="ค้นหาวันที่, อุปกรณ์..."
                                                        className="text-[12.5px] border border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-purple-400 text-slate-600 bg-white w-48 shadow-sm"
                                                        value={modalHistorySearchDate}
                                                        onChange={(e) => setModalHistorySearchDate(e.target.value)}
                                                    />
                                                    {modalHistorySearchDate && (
                                                        <button onClick={() => setModalHistorySearchDate("")} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white px-1 text-slate-400 hover:text-slate-600">
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {isModalHistoryLoading ? (
                                                <div className="text-center py-6 text-slate-400 text-[13px]">กำลังโหลดประวัติ...</div>
                                            ) : (
                                                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                                                <table className="w-full border-collapse">
                                                    <thead className="bg-slate-50 sticky top-0">
                                                        <tr>
                                                            <th className="text-left text-[11.5px] uppercase text-slate-500 font-bold p-3 border-b border-slate-200 pl-4 w-full">อุปกรณ์</th>
                                                            <th className="text-left text-[11.5px] uppercase text-slate-500 font-bold p-3 border-b border-slate-200 whitespace-nowrap px-4">วันที่ยืม</th>
                                                            <th className="text-left text-[11.5px] uppercase text-slate-500 font-bold p-3 border-b border-slate-200 whitespace-nowrap px-4">วันที่คืน</th>
                                                            <th className="text-left text-[11.5px] uppercase text-slate-500 font-bold p-3 border-b border-slate-200 whitespace-nowrap">สถานะ</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredModalHistory.length > 0 ? filteredModalHistory.map((h) => {
                                                            const hStatus = STATUS_MAP[h.status] || { label: h.status, cls: "bg-slate-100 text-slate-600" };
                                                            return (
                                                                <tr key={h.borrow_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                                                    <td className="p-3 pl-4">
                                                                        <div className="text-[12.5px] font-bold text-slate-700">{h.equipment_name}</div>
                                                                        <div className="text-[11px] text-slate-400">รหัส: {h.kit_code}</div>
                                                                    </td>
                                                                    <td className="p-3 px-4 text-[13px] text-slate-600 whitespace-nowrap">{formatThaiDate(h.borrow_date)}</td>
                                                                    <td className="p-3 px-4 text-[13px] text-slate-600 whitespace-nowrap">{h.return_date ? formatThaiDate(h.return_date) : '-'}</td>
                                                                    <td className="p-3 whitespace-nowrap">
                                                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${hStatus.cls}`}>
                                                                            {hStatus.label}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        }) : (
                                                            <tr>
                                                                <td colSpan="4" className="p-6 text-center text-slate-400 text-[12.5px]">ไม่มีประวัติการยืมอุปกรณ์</td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-white flex justify-end shrink-0">
                                        <button onClick={() => setIsUserModalOpen(false)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-medium text-[13px] hover:bg-slate-50 transition shadow-sm">
                                            ปิดหน้าต่าง
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                ) : currentPage === "notify" ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex justify-between items-center">
                            <div>
                                <h1 className="text-xl font-semibold">ประกาศ</h1>
                                <p className="text-[12.5px] text-slate-400 mt-0.5">ประกาศข้อความแจ้งเตือนถึงนักศึกษาทุกคนในระบบ</p>
                            </div>
                        </div>
                        <div className="p-8 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                            {/* Left Panel: Form */}
                            <div className="lg:col-span-7 bg-white border border-purple-100 rounded-3xl shadow-sm p-6">
                                <h2 className="text-[15px] font-bold text-slate-700 mb-5">เขียนข้อความประกาศ</h2>

                                <div className="space-y-4">

                                    <div>
                                        <label className="block text-[13px] font-bold text-slate-600 mb-1.5">หัวข้อ</label>
                                        <input
                                            type="text"
                                            placeholder="เช่น ประกาศปิดห้องสมุด"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13.5px] outline-none focus:border-purple-400 focus:bg-white transition"
                                            value={newNotification.title}
                                            onChange={e => setNewNotification({ ...newNotification, title: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[13px] font-bold text-slate-600 mb-1.5">ข้อความ</label>
                                        <textarea
                                            placeholder="พิมพ์ข้อความที่ต้องการประกาศ..."
                                            rows="5"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13.5px] outline-none focus:border-purple-400 focus:bg-white transition resize-none"
                                            value={newNotification.message}
                                            onChange={e => setNewNotification({ ...newNotification, message: e.target.value })}
                                        ></textarea>
                                    </div>
                                    <button
                                        onClick={handleSendNotification}
                                        className="bg-[#3b2075] text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold flex items-center gap-2 shadow-md hover:bg-[#2d175e] transition"
                                    >
                                        <Send size={15} /> ส่งประกาศ
                                    </button>
                                </div>
                            </div>

                            {/* Right Panel: History */}
                            <div className="lg:col-span-5 bg-white border border-purple-100 rounded-3xl shadow-sm p-6 min-h-[400px]">
                                <h2 className="text-[15px] font-bold text-slate-700 mb-5">ประวัติประกาศที่ส่งแล้ว</h2>

                                {isNotificationsLoading ? (
                                    <div className="text-center text-slate-400 text-sm py-8">กำลังโหลดข้อมูล...</div>
                                ) : notificationsData.length > 0 ? (
                                    <div className="space-y-4">
                                        {notificationsData.map(notif => (
                                            <div key={notif.id} className="border border-purple-50 rounded-xl p-4 bg-slate-50/50">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="text-[14px] font-bold text-slate-700 leading-tight pr-4">{notif.title}</h3>
                                                    <span className="text-[11px] text-slate-400 whitespace-nowrap pt-0.5">{formatThaiDate(notif.created_at)}</span>
                                                </div>
                                                <p className="text-[13px] text-slate-600 mb-3">{notif.message}</p>
                                                <div className="inline-block bg-purple-100 text-purple-700 text-[11px] font-semibold px-2 py-0.5 rounded-md">
                                                    ถึง: {notif.target === 'all' ? 'ทั้งหมด' : notif.target}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-slate-400 text-[13px] py-10 border border-dashed border-slate-200 rounded-xl">
                                        ไม่มีข้อมูลการแจ้งเตือน
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full min-h-[70vh]">
                        <div className="text-center text-slate-400">
                            <p className="font-semibold text-slate-600 mb-1">
                                หน้า "{NAV_ITEMS.find((n) => n.key === currentPage)?.label}"
                            </p>
                            <p className="text-sm">ส่วนนี้ยังไม่ได้พัฒนาในตัวอย่างนี้ครับ</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}