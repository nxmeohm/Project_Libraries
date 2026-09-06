import {
    Bell,
    Check,
    CheckSquare,
    ChevronRight,
    ChevronDown,
    Clock, DollarSign,
    LayoutGrid,
    LogOut,
    Package,
    Search,
    User,
    Users,
    X, Edit3, Trash2, Plus, Eye, Send, QrCode, FileText, Download, Upload, ClipboardList
} from "lucide-react";
import jsQR from "jsqr";
import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import * as htmlToImage from 'html-to-image';
import jsPDF from 'jspdf';
import React from 'react';

class ReportErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return <div className="p-8 text-red-600 font-bold bg-red-50 border border-red-200 rounded-xl m-8">Report Error: {this.state.error?.toString()}</div>;
        }
        return this.props.children;
    }
}


/* ============================================================
   Mock data — ตรงกับข้อมูลตัวอย่างในภาพ
   ============================================================ */
const KPI_DATA = [
    { key: "today", label: "ยืมวันนี้", value: "0", icon: CheckSquare, tone: "purple" },
    { key: "returned", label: "คืนแล้วทั้งหมด", value: "2", icon: Check, tone: "green" },
    { key: "overdue", label: "เลยกำหนดคืน", value: "1", icon: Clock, tone: "red" },
    { key: "pending", label: "ผู้ใช้รออนุมัติ", value: "3", icon: User, tone: "amber" },
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
};

const KPI_TONE = {
    purple: "bg-purple-100 text-purple-700",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-500",
    amber: "bg-amber-100 text-amber-600",
};

const NAV_ITEMS = [
    { key: "dashboard", label: "แดชบอร์ด", icon: LayoutGrid },
    { key: "borrows", label: "รายการยืม", icon: ClipboardList },
    { key: "returns", label: "รายการคืน", icon: CheckSquare },
    { key: "equipment", label: "คลังอุปกรณ์", icon: Package },
    { key: "users", label: "ผู้ใช้งาน / ประวัติ", icon: Users },
    { key: "notify", label: "ประกาศ", icon: Bell },
    { key: "report", label: "รายงาน", icon: FileText },
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

    const handleImageUpload = (e, targetField) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0, img.width, img.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                if (code) {
                    if (targetField === 'unified') {
                        setScanInput(code.data);
                        showToast("อ่านรหัสสำเร็จ กำลังดำเนินการ...", "success");
                        setTimeout(() => handleUnifiedScan(null, code.data), 300);
                    }
                } else {
                    showToast("ไม่พบ QR Code ในรูปภาพ", "error");
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset input
    };
    /* --- Report Feature States & Functions --- */
    const [reportType, setReportType] = useState('monthly');
    const [reportStartDate, setReportStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1); // 1st day of current month
        return d.toISOString().split('T')[0];
    });
    const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportData, setReportData] = useState([]);
    const [equipmentBreakdownData, setEquipmentBreakdownData] = useState([]);
    const [studentBreakdownData, setStudentBreakdownData] = useState([]);
    const [equipSortOrder, setEquipSortOrder] = useState('desc');
    const [displayFormat, setDisplayFormat] = useState('dashboard');
    const [isReportLoading, setIsReportLoading] = useState(false);
    const [isEquipBreakdownLoading, setIsEquipBreakdownLoading] = useState(false);
    const [isStudentBreakdownLoading, setIsStudentBreakdownLoading] = useState(false);
    
    // UI Display Toggles
    const [activeTab, setActiveTab] = useState('overview'); // overview, students, equipments
    const [showExportDropdown, setShowExportDropdown] = useState(false);

    const REPORT_LABEL = { monthly: 'รายเดือน', yearly: 'รายปี', equipment_stats: 'สถิติอุปกรณ์ยอดนิยม' };
    const THAI_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

    const getReportTitle = () => {
        const label = REPORT_LABEL[reportType] || reportType;
        const d1 = new Date(reportStartDate);
        const d2 = new Date(reportEndDate);
        const startStr = `${d1.getDate()} ${THAI_MONTHS[d1.getMonth() + 1]} ${d1.getFullYear() + 543}`;
        const endStr = `${d2.getDate()} ${THAI_MONTHS[d2.getMonth() + 1]} ${d2.getFullYear() + 543}`;
        return `รายงาน${label} (ตั้งแต่ ${startStr} - ${endStr})`;
    };

    const getReportSummary = () => {
        if (!reportData || reportData.length === 0) return null;
        const totalBorrows = reportData.reduce((sum, r) => sum + (parseInt(r.total_borrows) || 0), 0);
        const totalReturned = reportData.reduce((sum, r) => sum + (parseInt(r.total_returned) || 0), 0);
        const totalOverdue = reportData.reduce((sum, r) => sum + (parseInt(r.total_overdue) || 0), 0);
        return { totalBorrows, totalReturned, totalOverdue };
    };

    const generateReport = async () => {
        setIsReportLoading(true);
        try {
            const data = await authFetch(`/api/admin/reports?type=${reportType}&startDate=${reportStartDate}&endDate=${reportEndDate}&sort=${equipSortOrder}`);
            if (data.success) {
                const formattedData = (data.data || []).map(item => {
                    if (item.report_month && item.report_year) {
                        item.report_date = `${THAI_MONTHS[item.report_month]} ${item.report_year + 543}`;
                    } else if (item.report_year) {
                        item.report_date = `ปี ${item.report_year + 543}`;
                    }
                    return item;
                });
                setReportData(formattedData);
                fetchEquipmentBreakdown();
                fetchStudentBreakdown();
            } else {
                showToast("ดึงข้อมูลไม่สำเร็จ: " + data.message, "error");
            }
        } catch(e) {
            console.error(e);
            showToast("เกิดข้อผิดพลาดในการสร้างรายงาน", "error");
        }
        setIsReportLoading(false);
    };

    const fetchEquipmentBreakdown = async () => {
        setIsEquipBreakdownLoading(true);
        try {
            const data = await authFetch(`/api/admin/reports/equipment-breakdown?startDate=${reportStartDate}&endDate=${reportEndDate}`);
            if (data.success) {
                setEquipmentBreakdownData(data.data);
            }
        } catch (error) {
            console.error("Error fetching equipment breakdown:", error);
            showToast("เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์", "error");
        } finally {
            setIsEquipBreakdownLoading(false);
        }
    };

    const fetchStudentBreakdown = async () => {
        setIsStudentBreakdownLoading(true);
        try {
            const data = await authFetch(`/api/admin/reports/student-breakdown?startDate=${reportStartDate}&endDate=${reportEndDate}`);
            if (data.success) {
                setStudentBreakdownData(data.data);
            }
        } catch (error) {
            console.error("Error fetching student breakdown:", error);
            showToast("เกิดข้อผิดพลาดในการดึงข้อมูลนักศึกษา", "error");
        } finally {
            setIsStudentBreakdownLoading(false);
        }
    };

    // Auto-fetch report data when opening the report page
    useEffect(() => {
        if (currentPage === "report") {
            generateReport();
        }
    }, [currentPage, reportType, reportStartDate, reportEndDate]);

    /* --- Export Functions (Data-Driven) --- */
    const exportToExcel = () => {
        const workbook = XLSX.utils.book_new();
        // Sheet 1: Report summary
        if (reportData && reportData.length > 0) {
            const HEADER_MAP = {
                report_date: 'วันที่', report_month: 'เดือน', report_year: 'ปี',
                total_borrows: 'ยืมทั้งหมด', total_returned: 'คืนแล้ว', total_overdue: 'เลยกำหนด',
                name: 'ชื่ออุปกรณ์'
            };
            const mappedData = reportData.map(row => {
                const newRow = {};
                Object.entries(row).forEach(([k, v]) => { newRow[HEADER_MAP[k] || k] = v; });
                return newRow;
            });
            const ws1 = XLSX.utils.json_to_sheet(mappedData);
            XLSX.utils.book_append_sheet(workbook, ws1, "รายงาน");
        }
        // Sheet 2: Equipment breakdown
        if (showReportEquipment && equipmentBreakdownData && equipmentBreakdownData.length > 0) {
            const eqData = equipmentBreakdownData.map((eq, i) => ({
                'ลำดับ': i + 1,
                'ชื่ออุปกรณ์': eq.equipment_name,
                'รหัส': eq.kit_code,
                'หมวดหมู่': eq.category,
                'ยืมทั้งหมด': eq.total_borrows,
                'คืนแล้ว': eq.total_returned,
                'เลยกำหนด': eq.total_overdue,
                'กำลังยืม': eq.currently_borrowed,
            }));
            const ws2 = XLSX.utils.json_to_sheet(eqData);
            XLSX.utils.book_append_sheet(workbook, ws2, "อุปกรณ์");
        }
        // 3. Add Student Breakdown sheet
        if (studentBreakdownData && studentBreakdownData.length > 0) {
            const wsStudent = XLSX.utils.json_to_sheet(studentBreakdownData.map(s => ({
                'รหัสนักศึกษา': s.student_id,
                'ชื่อ-นามสกุล': s.student_name,
                'ยืมทั้งหมด': s.total_borrows,
                'คืนแล้ว': s.total_returned,
                'เลยกำหนด': s.total_overdue,
                'กำลังยืม': s.currently_borrowed
            })));
            XLSX.utils.book_append_sheet(workbook, wsStudent, "ข้อมูลนักศึกษา");
        }

        if (workbook.SheetNames.length === 0) return showToast("ไม่มีข้อมูลให้ส่งออก", "warning");
        XLSX.writeFile(workbook, `Report_${reportType}_${Date.now()}.xlsx`);
        showToast("ส่งออก Excel สำเร็จ", "success");
    };

    const exportToPDF = async () => {
        const element = document.getElementById('report-capture-area');
        if (!element) return showToast('ไม่พบข้อมูลที่จะส่งออก', 'warning');
        showToast('กำลังสร้างไฟล์ PDF...', 'info');
        try {
            const dataUrl = await htmlToImage.toPng(element, {
                quality: 1,
                pixelRatio: 2,
                backgroundColor: '#f8fafc', // slate-50 background for consistency
            });
            
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF('p', 'mm', 'a4');
            
            const imgProps = doc.getImageProperties(dataUrl);
            const pdfWidth = doc.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            // If the content is longer than one page, this simple method will scale it to fit width, 
            // and it might overflow the bottom if extremely long. But for dashboards, it's usually fine.
            doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
            doc.save(`Report_${reportType}_${Date.now()}.pdf`);
            showToast('ส่งออก PDF สำเร็จ', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            showToast('เกิดข้อผิดพลาดในการส่งออก PDF: ' + err.message, 'error');
        }
    };

    const exportToImage = async () => {
        const element = document.getElementById('report-capture-area');
        if (!element) return showToast('ไม่พบข้อมูลที่จะส่งออก', 'warning');
        showToast('กำลังสร้างรูปภาพ...', 'info');
        try {
            const dataUrl = await htmlToImage.toPng(element, {
                quality: 1,
                pixelRatio: 2,
                backgroundColor: '#ffffff',
            });
            const link = document.createElement('a');
            link.download = `report_${reportType}_${Date.now()}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('ส่งออกรูปภาพสำเร็จ', 'success');
        } catch (err) {
            console.error('Image export error:', err);
            showToast('เกิดข้อผิดพลาดในการส่งออกรูปภาพ: ' + err.message, 'error');
        }
    };
    /* ----------------------------------------- */


    const [requestsData, setRequestsData] = useState([]);
    const [filterStatus, setFilterStatus] = useState("all");
    const [isRequestsLoading, setIsRequestsLoading] = useState(false);
    const [requestFilterDate, setRequestFilterDate] = useState("");

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

    const handleAction = async (id, action) => {
        if (!confirm(`ยืนยันการดำเนินการ?`)) return;

        try {
            const data = await authFetch('/api/admin/update-request', {
                method: "POST",
                body: JSON.stringify({ id, action })
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

    const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
    const [selectedKitItems, setSelectedKitItems] = useState([]);
    const [selectedKitName, setSelectedKitName] = useState("");
    const [isKitItemsLoading, setIsKitItemsLoading] = useState(false);

    const handleViewItems = async (eq) => {
        setSelectedKitName(eq.name);
        setIsItemsModalOpen(true);
        setIsKitItemsLoading(true);
        try {
            const data = await authFetch(`/api/admin/equipments/${eq.equipment_id}/items`);
            if (data.success) {
                setSelectedKitItems(data.data);
            } else {
                setSelectedKitItems([]);
                showToast('ไม่สามารถดึงข้อมูลไอเท็มได้: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        } finally {
            setIsKitItemsLoading(false);
        }
    };

    const [isUnifiedScannerOpen, setIsUnifiedScannerOpen] = useState(false);
    const [scanInput, setScanInput] = useState("");
    const [isSubmittingScan, setIsSubmittingScan] = useState(false);

    const handleUnifiedScan = async (e, scannedCode = null) => {
        if (e) e.preventDefault();
        if (isSubmittingScan) return;
        
        const inputToUse = (scannedCode || scanInput).trim();
        if (!inputToUse) return showToast('กรุณากรอกรหัสคิว หรือ รหัสครุภัณฑ์', 'warning');

        setIsSubmittingScan(true);

        const isQueueScan = inputToUse.toUpperCase().startsWith('QUEUE-') || inputToUse.toUpperCase().startsWith('LB');

        try {
            if (isQueueScan) {
                const qIdClean = inputToUse.toUpperCase().replace('QUEUE-', '');
                const data = await authFetch('/api/admin/pickup_queue.php', {
                    method: 'POST',
                    body: JSON.stringify({
                        queue_id: qIdClean,
                        barcode: 'AUTO'
                    })
                });
                if (data.success) {
                    showToast('จ่ายอุปกรณ์ให้คิวสำเร็จ', 'success');
                    setIsUnifiedScannerOpen(false);
                    setScanInput("");
                    fetchDashboard();
                    fetchRequests();
                } else {
                    showToast(data.message || 'เกิดข้อผิดพลาดในการจ่ายคิว', 'error');
                }
            } else {
                const data = await authFetch('/api/admin/return_by_barcode.php', {
                    method: 'POST',
                    body: JSON.stringify({ barcode: inputToUse })
                });
                
                if (data.success) {
                    showToast(data.message || 'รับคืนอุปกรณ์สำเร็จ', 'success');
                    setIsUnifiedScannerOpen(false);
                    setScanInput("");
                    fetchDashboard();
                    fetchRequests();
                    fetchEquipments();
                } else {
                    showToast(data.message || 'เกิดข้อผิดพลาดในการรับคืน', 'error');
                }
            }
        } catch (err) {
            console.error(err);
            showToast('เชื่อมต่อเซิร์ฟเวอร์ล้มเหลว', 'error');
        } finally {
            setIsSubmittingScan(false);
        }
    };

    const handleUpdateItemStatus = async (itemId, newStatus) => {
        try {
            const data = await authFetch(`/api/admin/equipment-items/${itemId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });
            if (data.success) {
                showToast('อัปเดตสถานะสำเร็จ', 'success');
                setSelectedKitItems(prev => prev.map(item => item.item_id === itemId ? { ...item, status: newStatus } : item));
                fetchEquipments();
            } else {
                showToast('เกิดข้อผิดพลาด: ' + data.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถติดต่อเซิร์ฟเวอร์ได้', 'error');
        }
    };

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

    const [notificationImageFile, setNotificationImageFile] = useState(null);

    const handleSendNotification = async () => {
        if (!newNotification.title || !newNotification.message) return showToast('กรุณากรอกหัวข้อและข้อความให้ครบถ้วน', 'warning');
        try {
            const formData = new FormData();
            formData.append('target', newNotification.target);
            formData.append('title', newNotification.title);
            formData.append('message', newNotification.message);
            if (notificationImageFile) {
                formData.append('notification_img', notificationImageFile);
            }

            const data = await authFetch('/api/admin/notifications', {
                method: "POST",
                body: formData
            });
            if (data.success) {
                showToast('ส่งการแจ้งเตือนสำเร็จ', 'success');
                setNewNotification({ target: "all", title: "", message: "" });
                setNotificationImageFile(null);
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
        } else if (currentPage === "borrows" || currentPage === "returns") {
            fetchRequests();
            setFilterStatus("all");
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
            } else if (currentPage === "borrows" || currentPage === "returns") {
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
        { key: "pending", label: "ผู้ใช้รออนุมัติ", value: (dashboardData.kpi.pending || 0).toLocaleString(), icon: User, tone: "amber" },
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

    const filteredRequests = requestsData.filter(r => {
        if (currentPage === "borrows") {
            if (!["pending", "borrowed", "overdue"].includes(r.status)) return false;
        } else if (currentPage === "returns") {
            if (!["returned", "damaged_lost"].includes(r.status)) return false;
        }

        const matchStatus = filterStatus === "all" || r.status === filterStatus;
        if (!matchStatus) return false;
        if (!requestFilterDate) return true;
        
        const bDate = r.borrow_date ? new Date(r.borrow_date).toISOString().split('T')[0] : "";
        const rDate = r.return_date ? new Date(r.return_date).toISOString().split('T')[0] : "";
        return bDate === requestFilterDate || rDate === requestFilterDate;
    });

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
                        if (item.key === "borrows" && dashboardData?.kpi?.pending > 0) {
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

                <button onClick={() => setIsUnifiedScannerOpen(true)} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[13.5px] font-medium transition bg-green-500/20 text-green-300 hover:bg-green-500/30 mb-4 justify-center shadow-sm">
                    <QrCode size={18} />
                    สแกน QR / บาร์โค้ด
                </button>

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
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
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
                            <div className="bg-white border border-emerald-100 rounded-3xl shadow-sm p-5 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[15.5px] font-semibold">แนวโน้มการยืมอุปกรณ์</h3>
                                    <div className="flex bg-emerald-50 rounded-lg p-0.5 gap-0.5">
                                        {[["day", "รายวัน"], ["month", "รายเดือน"], ["year", "รายปี"]].map(([key, label]) => (
                                            <button
                                                key={key}
                                                onClick={() => setChartRange(key)}
                                                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition ${chartRange === key ? "bg-emerald-500 text-white shadow-sm" : "text-slate-400 hover:text-emerald-500"
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
                                            <span className="text-[10.5px] font-bold text-emerald-500">{d.v}</span>
                                            <div
                                                className="w-full max-w-[34px] rounded-t-lg rounded-b-sm bg-gradient-to-b from-emerald-300 to-emerald-500 shadow-sm transition-all duration-300"
                                                style={{ height: `${Math.max(6, Math.round((d.v / maxVal) * 100))}%` }}
                                            />
                                            <span className="text-[11px] text-slate-400">{d.l}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recent activity table */}
                            <div className="bg-white border border-emerald-100 rounded-3xl shadow-sm p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-[15.5px] font-semibold">กิจกรรมล่าสุด</h3>
                                    <button
                                        onClick={() => setCurrentPage("borrows")}
                                        className="text-[12.5px] font-semibold text-emerald-500 flex items-center gap-1 hover:gap-1.5 transition-all"
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
                ) : (currentPage === "borrows" || currentPage === "returns") ? (
                    <>
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10">
                            <h1 className="text-xl font-semibold">{currentPage === "borrows" ? "รายการยืม" : "รายการคืน"} และสถานะ</h1>
                            <p className="text-[12.5px] text-slate-400 mt-0.5">{currentPage === "borrows" ? "อนุมัติคำขอยืม และตรวจสอบอุปกรณ์ที่กำลังยืม" : "จัดการและติดตามสถานะการคืนอุปกรณ์"}</p>
                        </div>
                        <div className="p-8 pt-6">
                            <div className="bg-white border border-purple-100 rounded-3xl shadow-sm p-6">
                                {/* Filters */}
                                <div className="flex flex-wrap gap-3 mb-6 items-center pb-2">
                                    <div className="flex gap-3 overflow-x-auto">
                                        {(currentPage === "borrows" ? [
                                            { id: "all", label: "ทั้งหมด" },
                                            { id: "pending", label: "รออนุมัติ" },
                                            { id: "borrowed", label: "กำลังยืม" },
                                            { id: "overdue", label: "เลยกำหนด" }
                                        ] : [
                                            { id: "all", label: "ทั้งหมด" },
                                            { id: "returned", label: "คืนแล้ว" },
                                            { id: "damaged_lost", label: "สูญหาย/เสียหาย" }
                                        ]).map(f => (
                                            <button
                                                key={f.id}
                                                onClick={() => setFilterStatus(f.id)}
                                                className={`px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition ${filterStatus === f.id ? "bg-purple-700 text-white shadow-md shadow-purple-200" : "bg-purple-50 text-purple-700 hover:bg-purple-100"}`}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="ml-auto flex items-center gap-2">
                                        <label className="text-[13px] font-semibold text-slate-500 whitespace-nowrap">ระบุวันที่:</label>
                                        <input
                                            type="date"
                                            value={requestFilterDate}
                                            onChange={(e) => setRequestFilterDate(e.target.value)}
                                            className="border border-purple-100 rounded-lg px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:border-purple-300 focus:ring-1 focus:ring-purple-300"
                                        />
                                        {requestFilterDate && (
                                            <button 
                                                onClick={() => setRequestFilterDate("")}
                                                className="text-[12px] text-red-500 hover:text-red-700 font-semibold ml-1 whitespace-nowrap"
                                            >
                                                ล้างค่า
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse min-w-[800px]">
                                        <thead>
                                            <tr>
                                                {["รหัสนศ.", "ชื่อ-นามสกุล", "อุปกรณ์", "วันที่ขอ", "กำหนดคืน", "สถานะ", "การจัดการ"].map((h) => (
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
                                                        <div className="text-[11px] text-slate-400">Kit {String(r.equipment_code).replace(/^Kit\s*/i, '')}</div>
                                                    </td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{formatThaiDate(r.borrow_date)}</td>
                                                    <td className="py-4 px-4 text-[13px] text-slate-600">{formatThaiDate(r.return_date)}</td>
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
                                                {["อุปกรณ์", "รหัส", "หมวดหมู่", "สถานะ", "คงเหลือ/ทั้งหมด", "ยืมได้ (วัน)", "ราคา", "การจัดการ"].map((h) => (
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
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { setEditEquip(eq); setIsEditModalOpen(true); }} className="w-8 h-8 rounded-lg border border-purple-200 text-purple-600 flex items-center justify-center hover:bg-purple-50 transition">
                                                                <Edit3 size={15} />
                                                            </button>
                                                            <button onClick={() => handleViewItems(eq)} className="w-8 h-8 rounded-lg border border-blue-200 text-blue-500 flex items-center justify-center hover:bg-blue-50 transition">
                                                                <Eye size={15} />
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
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รหัสครุภัณฑ์</label>
                                                <div className="flex w-full bg-slate-50 border border-purple-100 rounded-xl overflow-hidden focus-within:border-purple-400">
                                                    <span className="bg-slate-200/50 text-slate-500 font-bold px-4 py-3 border-r border-purple-100 flex items-center justify-center">Kit</span>
                                                    <input type="text" placeholder="XXXX" className="w-full bg-transparent px-4 py-3 text-[14px] outline-none"
                                                        value={newEquip.kit_code.replace(/^Kit /i, '')} onChange={e => setNewEquip({ ...newEquip, kit_code: `Kit ${e.target.value}` })} />
                                                </div>
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
                                            <label className="block text-[13.5px] font-bold text-purple-900 mb-2">ราคาสินค้า (บาท)</label>
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

                        {/* Items Modal */}
                        {isItemsModalOpen && (
                            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                                    <div className="px-8 py-5 border-b border-purple-100 flex justify-between items-center bg-purple-50">
                                        <h3 className="font-bold text-[16px] text-purple-900 flex items-center gap-2">
                                            <Package size={18} /> รายการอุปกรณ์ย่อย: {selectedKitName}
                                        </h3>
                                        <button onClick={() => setIsItemsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition">
                                            <X size={20} />
                                        </button>
                                    </div>
                                    <div className="p-8 overflow-y-auto">
                                        <div className="overflow-x-auto">
                                            <table className="w-full border-collapse">
                                                <thead>
                                                    <tr>
                                                        {["ลำดับ (Sequence)", "รหัสครุภัณฑ์ (Asset Code)", "สถานะ"].map((h) => (
                                                            <th key={h} className="text-left text-[12px] uppercase tracking-wide text-slate-400 font-bold pb-4 border-b-2 border-purple-100 px-4 first:pl-2">
                                                                {h}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isKitItemsLoading ? (
                                                        <tr><td colSpan="3" className="py-8 text-center text-slate-400 text-sm">กำลังโหลดข้อมูล...</td></tr>
                                                    ) : selectedKitItems.length > 0 ? selectedKitItems.map((item) => (
                                                        <tr key={item.item_id} className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0">
                                                            <td className="py-4 px-4 first:pl-2 text-[13px] font-medium text-slate-700">{item.sequence_code}</td>
                                                            <td className="py-4 px-4 text-[13px] text-slate-600">{item.full_asset_code}</td>
                                                            <td className="py-4 px-4">
                                                                {item.status === 'borrowed' ? (
                                                                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700 inline-block text-center cursor-not-allowed">
                                                                        ถูกยืม
                                                                    </span>
                                                                ) : (
                                                                    <select
                                                                        className={`px-3 py-1 rounded-full text-[11px] font-bold outline-none cursor-pointer text-center ${item.status === 'available' ? 'bg-green-100 text-green-700' :
                                                                                'bg-orange-100 text-orange-700'
                                                                            }`}
                                                                        value={item.status}
                                                                        onChange={(e) => handleUpdateItemStatus(item.item_id, e.target.value)}
                                                                    >
                                                                        <option value="available" className="bg-white text-slate-700">ใช้งานได้</option>
                                                                        <option value="damaged_lost" className="bg-white text-slate-700">งดใช้ชั่วคราว</option>
                                                                    </select>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )) : (
                                                        <tr><td colSpan="3" className="py-8 text-center text-slate-400 text-sm">ไม่มีไอเท็มในอุปกรณ์นี้</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="pt-6 flex justify-end">
                                            <button onClick={() => setIsItemsModalOpen(false)} className="px-6 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-[13px] hover:bg-slate-200 transition">
                                                ปิด
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
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[13.5px] font-bold text-purple-900 mb-2">รหัสอุปกรณ์ (Kit Code)</label>
                                                <div className="flex w-full bg-slate-50 border border-purple-100 rounded-xl overflow-hidden focus-within:border-purple-400">
                                                    <span className="bg-slate-200/50 text-slate-500 font-bold px-4 py-3 border-r border-purple-100 flex items-center justify-center">Kit</span>
                                                    <input type="text" className="w-full bg-transparent px-4 py-3 text-[14px] outline-none"
                                                        value={(editEquip.kit_code || '').replace(/^Kit /i, '')} onChange={e => setEditEquip({ ...editEquip, kit_code: `Kit ${e.target.value}` })} />
                                                </div>
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
                                    <div>
                                        <label className="block text-[13px] font-bold text-slate-600 mb-1.5">รูปภาพประกอบ (ไม่บังคับ)</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[13px] outline-none focus:border-purple-400 transition"
                                            onChange={(e) => setNotificationImageFile(e.target.files[0])}
                                        />
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
                                ) : notificationsData.filter(n => n.target === 'all').length > 0 ? (
                                    <div className="space-y-4">
                                        {notificationsData.filter(n => n.target === 'all').map(notif => (
                                            <div key={notif.id} className="border border-purple-50 rounded-xl p-4 bg-slate-50/50">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className="text-[14px] font-bold text-slate-700 leading-tight pr-4">{notif.title}</h3>
                                                    <span className="text-[11px] text-slate-400 whitespace-nowrap pt-0.5">{formatThaiDate(notif.created_at)}</span>
                                                </div>
                                                <p className="text-[13px] text-slate-600 mb-3">{notif.message}</p>
                                                {notif.image_url && (
                                                    <div className="mb-3">
                                                        <img src={`http://localhost:5000/${notif.image_url}`} alt="Notification Image" className="rounded-lg max-h-32 object-cover" />
                                                    </div>
                                                )}
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
                ) : currentPage === "report" ? (
                    <ReportErrorBoundary>
                        {/* Header */}
                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex items-center gap-4">
                            <div>
                                <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">รายงานและสถิติ</h1>
                                <p className="text-[13px] text-slate-500">สร้างและส่งออกข้อมูลรายงาน</p>
                            </div>
                        </div>

                        <div className="p-8 pb-32">
                            {/* 1. Filter Card */}
                            <div className="bg-white rounded-[20px] p-6 shadow-sm border border-slate-100 mb-6">
                                <div className="flex flex-wrap items-end gap-4">
                                    <div className="flex-1 min-w-[180px]">
                                        <label className="block text-[13px] font-bold text-slate-500 mb-2">ประเภทรายงาน</label>
                                        <div className="relative">
                                            <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#3D2B56] focus:ring-1 focus:ring-[#3D2B56] appearance-none cursor-pointer">
                                                <option value="monthly">รายเดือน (สรุปเป็นเดือน)</option>
                                                <option value="yearly">รายปี (สรุปเป็นปี)</option>
                                                <option value="equipment_stats">สถิติอุปกรณ์ยอดนิยม</option>
                                            </select>
                                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="block text-[13px] font-bold text-slate-500 mb-2">ตั้งแต่วันที่</label>
                                        <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#3D2B56] focus:ring-1 focus:ring-[#3D2B56]" />
                                    </div>
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="block text-[13px] font-bold text-slate-500 mb-2">ถึงวันที่</label>
                                        <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#3D2B56] focus:ring-1 focus:ring-[#3D2B56]" />
                                    </div>

                                    {reportType === 'equipment_stats' && (
                                        <div className="flex-1 min-w-[180px]">
                                            <label className="block text-[13px] font-bold text-slate-500 mb-2">การจัดอันดับ</label>
                                            <div className="relative">
                                                <select value={equipSortOrder} onChange={e => setEquipSortOrder(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#3D2B56] focus:ring-1 focus:ring-[#3D2B56] appearance-none cursor-pointer">
                                                    <option value="desc">ใช้มากที่สุด</option>
                                                    <option value="asc">ใช้น้อยที่สุด</option>
                                                </select>
                                                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex-1 min-w-[180px]">
                                        <label className="block text-[13px] font-bold text-slate-500 mb-2">รูปแบบการแสดงผล</label>
                                        <div className="relative">
                                            <select value={displayFormat} onChange={e => setDisplayFormat(e.target.value)} className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-700 outline-none focus:border-[#3D2B56] focus:ring-1 focus:ring-[#3D2B56] appearance-none cursor-pointer">
                                                <option value="dashboard">Dashboard (รวมทั้งหมด)</option>
                                                <option value="table">ตารางข้อมูล</option>
                                                <option value="chart">แผนภูมิ / กราฟ</option>
                                            </select>
                                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    
                                    <div className="shrink-0 w-full md:w-auto mt-2 md:mt-0">
                                        <button onClick={() => { generateReport(); }} disabled={isReportLoading} className="bg-[#3D2B56] text-white px-8 py-2.5 rounded-xl text-[14px] font-bold shadow-sm hover:bg-[#2A1D3C] transition active:scale-95 w-full">
                                            {isReportLoading ? "กำลังดึงข้อมูล..." : "สร้างรายงาน"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Data Card */}
                            <div className="bg-white rounded-[20px] shadow-sm border border-slate-100 overflow-visible relative">
                                {/* Header / Tabs */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 px-6 pt-4 pb-0">
                                    <div className="flex items-center gap-6 overflow-x-auto custom-scrollbar">
                                        <button 
                                            onClick={() => setActiveTab('overview')} 
                                            className={`flex items-center gap-2 pb-4 px-2 border-b-2 transition ${activeTab === 'overview' ? 'border-[#3D2B56] text-[#3D2B56] font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'}`}
                                        >
                                            <FileText size={16} /> ภาพรวม <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">{reportData.length}</span>
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('students')} 
                                            className={`flex items-center gap-2 pb-4 px-2 border-b-2 transition ${activeTab === 'students' ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'}`}
                                        >
                                            <User size={16} /> ข้อมูลนักศึกษา <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-[10px]">{studentBreakdownData.length}</span>
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('equipments')} 
                                            className={`flex items-center gap-2 pb-4 px-2 border-b-2 transition ${activeTab === 'equipments' ? 'border-amber-500 text-amber-500 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700 font-medium'}`}
                                        >
                                            <Package size={16} /> ข้อมูลอุปกรณ์ <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-[10px]">{equipmentBreakdownData.length}</span>
                                        </button>
                                    </div>
                                    
                                    <div className="pb-4 sm:pb-3 mt-4 sm:mt-0 relative">
                                        <button 
                                            onClick={() => setShowExportDropdown(!showExportDropdown)} 
                                            className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-xl text-[13px] font-bold transition"
                                        >
                                            <Download size={14} /> ดาวน์โหลด <ChevronDown size={14} className={`transition ${showExportDropdown ? 'rotate-180' : ''}`} />
                                        </button>
                                        
                                        {showExportDropdown && (
                                            <div className="absolute right-0 top-[110%] w-40 bg-white border border-slate-100 shadow-lg rounded-xl overflow-hidden z-50 py-1">
                                                <button onClick={() => { exportToExcel(); setShowExportDropdown(false); }} className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-green-50 hover:text-green-700 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-green-500"></div> Excel (.xlsx)
                                                </button>
                                                <button onClick={() => { exportToPDF(); setShowExportDropdown(false); }} className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div> PDF (.pdf)
                                                </button>
                                                <button onClick={() => { exportToImage(); setShowExportDropdown(false); }} className="w-full text-left px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div> Image (.png)
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Content Area */}
                                <div id="report-capture-area" className="p-6">
                                    {(isReportLoading || isEquipBreakdownLoading || isStudentBreakdownLoading) ? (
                                        <div className="py-20 text-center text-slate-400">กำลังโหลดข้อมูลรายงาน...</div>
                                    ) : (!reportData || reportData.length === 0) ? (
                                        <div className="py-20 text-center text-slate-400">ไม่มีข้อมูล หรือยังไม่ได้กดสร้างรายงาน</div>
                                    ) : (
                                        <>
                                            {/* TAB 1: OVERVIEW */}
                                            {activeTab === 'overview' && (
                                                <div className="space-y-6">
                                                    {/* KPI Cards */}
                                                    {displayFormat === 'dashboard' && (
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center border-l-4 border-l-purple-600">
                                                                <p className="text-[12px] text-slate-500 font-bold mb-1">ยอดการยืมทั้งหมด</p>
                                                                <p className="text-3xl font-extrabold text-slate-800">{getReportSummary()?.totalBorrows || 0}</p>
                                                            </div>
                                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center border-l-4 border-l-green-500">
                                                                <p className="text-[12px] text-slate-500 font-bold mb-1">คืนแล้ว</p>
                                                                <p className="text-3xl font-extrabold text-slate-800">{getReportSummary()?.totalReturned || 0}</p>
                                                            </div>
                                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center border-l-4 border-l-red-500">
                                                                <p className="text-[12px] text-slate-500 font-bold mb-1">เลยกำหนด</p>
                                                                <p className="text-3xl font-extrabold text-slate-800">{getReportSummary()?.totalOverdue || 0}</p>
                                                            </div>
                                                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col justify-center border-l-4 border-l-blue-500">
                                                                <p className="text-[12px] text-slate-500 font-bold mb-1">ประเภทอุปกรณ์ที่ถูกยืม</p>
                                                                <p className="text-3xl font-extrabold text-slate-800">
                                                                    {equipmentBreakdownData && equipmentBreakdownData.length > 0
                                                                        ? new Set(equipmentBreakdownData.map(e => e.category)).size
                                                                        : 0}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Chart */}
                                                    {(displayFormat === 'dashboard' || displayFormat === 'chart') && reportType !== 'equipment_stats' && (
                                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                                                            <h2 className="text-[14px] font-bold text-slate-700 mb-6">📉 ปริมาณการยืม-คืน</h2>
                                                            <div className="h-[300px]">
                                                                <ResponsiveContainer width="100%" height="100%">
                                                                    <BarChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis dataKey={['monthly', 'daily'].includes(reportType) ? 'report_date' : reportType === 'yearly' ? 'report_month' : 'report_year'} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                                                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                                                                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} verticalAlign="top" />
                                                                        <Bar dataKey="total_borrows" name="ยอดการยืม" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                                                        <Bar dataKey="total_returned" name="คืนแล้ว" fill="#10B981" radius={[4, 4, 0, 0]} />
                                                                    </BarChart>
                                                                </ResponsiveContainer>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Equipment Stats Chart */}
                                                    {(displayFormat === 'dashboard' || displayFormat === 'chart') && reportType === 'equipment_stats' && (
                                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)]">
                                                            <h2 className="text-[14px] font-bold text-slate-700 mb-6">📊 สถิติอุปกรณ์ยอดนิยม</h2>
                                                            <div className="h-[380px]">
                                                                <ResponsiveContainer width="100%" height="100%">
                                                                    <BarChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 80 }}>
                                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                                        <XAxis 
                                                                            dataKey="name" 
                                                                            axisLine={false} 
                                                                            tickLine={false} 
                                                                            interval={0} 
                                                                            tickFormatter={(value) => value.length > 20 ? `${value.substring(0, 20)}...` : value}
                                                                            tick={{ fontSize: 11, fill: '#94a3b8', dy: 10 }} 
                                                                            angle={-45} 
                                                                            textAnchor="end" 
                                                                        />
                                                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                                                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                                                                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }} verticalAlign="top" />
                                                                        <Bar dataKey="total_borrows" name="จำนวนการยืม (ครั้ง)" radius={[4, 4, 0, 0]}>
                                                                            {reportData.map((entry, index) => (
                                                                                <Cell key={`cell-${index}`} fill={['#3B82F6', '#10B981', '#FACC15', '#EF4444', '#F97316', '#8B5CF6', '#14B8A6', '#EC4899'][index % 8]} />
                                                                            ))}
                                                                        </Bar>
                                                                    </BarChart>
                                                                </ResponsiveContainer>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Report Table */}
                                                    {(displayFormat === 'dashboard' || displayFormat === 'table') && (
                                                        <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
                                                            <table className="w-full text-left border-collapse relative">
                                                                <thead className="sticky top-0 bg-slate-50/90 backdrop-blur z-10">
                                                                    <tr className="text-[12.5px] uppercase text-slate-500 border-b border-slate-200">
                                                                        {reportData[0] && Object.keys(reportData[0]).map(k => (
                                                                            <th key={k} className="py-3 px-4 font-bold whitespace-nowrap">{k === 'report_date' ? 'วันที่' : k === 'report_month' ? 'เดือน' : k === 'report_year' ? 'ปี (ค.ศ.)' : k === 'total_borrows' ? 'ยืมทั้งหมด' : k === 'total_returned' ? 'คืนแล้ว' : k === 'total_overdue' ? 'เลยกำหนด' : k === 'name' ? 'ชื่ออุปกรณ์' : k}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {reportData.map((row, i) => (
                                                                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                                                                            {row && Object.values(row).map((val, idx) => (
                                                                                <td key={idx} className={`py-3 px-4 text-[13px] ${idx > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                                                                                    {val}
                                                                                </td>
                                                                            ))}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* TAB 2: STUDENTS */}
                                            {activeTab === 'students' && (
                                                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
                                                    <table className="w-full text-left border-collapse relative">
                                                        <thead className="sticky top-0 bg-blue-50/90 backdrop-blur z-10">
                                                            <tr className="text-[12px] uppercase text-blue-700 border-b border-blue-100">
                                                                <th className="py-3 px-4 font-bold w-16">#</th>
                                                                <th className="py-3 px-4 font-bold">รหัสนักศึกษา</th>
                                                                <th className="py-3 px-4 font-bold">ชื่อ-นามสกุล</th>
                                                                <th className="py-3 px-4 font-bold text-center">ยืมทั้งหมด</th>
                                                                <th className="py-3 px-4 font-bold text-center">คืนแล้ว</th>
                                                                <th className="py-3 px-4 font-bold text-center">เลยกำหนด</th>
                                                                <th className="py-3 px-4 font-bold text-center">กำลังยืม</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {studentBreakdownData.map((s, i) => (
                                                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition">
                                                                    <td className="py-3 px-4 text-[13px] text-slate-400 font-medium">{i + 1}</td>
                                                                    <td className="py-3 px-4 text-[13px] text-slate-500 font-mono">{s.student_id || '-'}</td>
                                                                    <td className="py-3 px-4 text-[13px] text-slate-700 font-bold">{s.student_name || 'ไม่ระบุ'}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-slate-700">{s.total_borrows}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-green-600">{s.total_returned}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-red-500">{s.total_overdue}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-amber-500">{s.currently_borrowed}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* TAB 3: EQUIPMENTS */}
                                            {activeTab === 'equipments' && (
                                                <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
                                                    <table className="w-full text-left border-collapse relative">
                                                        <thead className="sticky top-0 bg-amber-50/90 backdrop-blur z-10">
                                                            <tr className="text-[12px] uppercase text-amber-700 border-b border-amber-100">
                                                                <th className="py-3 px-4 font-bold w-16">#</th>
                                                                <th className="py-3 px-4 font-bold">ชื่ออุปกรณ์</th>
                                                                <th className="py-3 px-4 font-bold">รหัส</th>
                                                                <th className="py-3 px-4 font-bold">หมวดหมู่</th>
                                                                <th className="py-3 px-4 font-bold text-center">ยืมทั้งหมด</th>
                                                                <th className="py-3 px-4 font-bold text-center">คืนแล้ว</th>
                                                                <th className="py-3 px-4 font-bold text-center">เลยกำหนด</th>
                                                                <th className="py-3 px-4 font-bold text-center">กำลังยืม</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {equipmentBreakdownData.map((eq, i) => (
                                                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition">
                                                                    <td className="py-3 px-4 text-[13px] text-slate-400 font-medium">{i + 1}</td>
                                                                    <td className="py-3 px-4 text-[13px] text-slate-700 font-bold">{eq.equipment_name}</td>
                                                                    <td className="py-3 px-4 text-[12px] text-slate-500 font-mono">{eq.kit_code}</td>
                                                                    <td className="py-3 px-4">
                                                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[11px] font-bold">{eq.category}</span>
                                                                    </td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-slate-700">{eq.total_borrows}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-green-600">{eq.total_returned}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-red-500">{eq.total_overdue}</td>
                                                                    <td className="py-3 px-4 text-center text-[13px] font-bold text-amber-500">{eq.currently_borrowed}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </>
                                )}
                            </div>
                        </div>
                    </div>
                </ReportErrorBoundary>
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
            {/* ================= MODALS ================= */}
            {isUnifiedScannerOpen && (
                <div className="fixed inset-0 bg-[#3D2B56]/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-[slideIn_0.3s_ease]">
                        <div className="px-6 py-5 border-b border-purple-100 flex items-center justify-between bg-purple-50">
                            <h2 className="text-[17px] font-bold text-slate-800">สแกน QR / บาร์โค้ด</h2>
                            <button onClick={() => setIsUnifiedScannerOpen(false)} className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUnifiedScan} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-700 mb-2">สแกนรหัสคิว / รหัสครุภัณฑ์</label>
                                    <div className="flex gap-2">
                                        <input autoFocus type="text" value={scanInput} onChange={e => {
                                            setScanInput(e.target.value);
                                            if (window.scanTimeout) clearTimeout(window.scanTimeout);
                                            if (e.target.value.trim().length > 6) {
                                                window.scanTimeout = setTimeout(() => handleUnifiedScan(null, e.target.value), 500);
                                            }
                                        }} placeholder="เช่น LB123456 หรือ 310510..." className="flex-1 bg-slate-50 border border-purple-100 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-purple-400" />
                                        <label className="bg-purple-100 text-purple-700 rounded-xl px-4 flex items-center justify-center cursor-pointer hover:bg-purple-200 transition" title="อัพโหลดรูป QR/Barcode">
                                            <Upload size={20} />
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'unified')} />
                                        </label>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-2">* ระบบจะตรวจสอบประเภทบาร์โค้ดและดำเนินการ จ่ายคิว หรือ รับคืน อัตโนมัติ</p>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button type="button" onClick={() => { setIsUnifiedScannerOpen(false); setScanInput(""); }} className="flex-1 px-4 py-2.5 rounded-xl text-[13.5px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition" disabled={isSubmittingScan}>ยกเลิก</button>
                                <button type="submit" disabled={!scanInput || isSubmittingScan} className="flex-1 px-4 py-2.5 rounded-xl text-[13.5px] font-bold bg-[#3D2B56] text-white hover:bg-[#2A1D3C] transition disabled:opacity-50">{isSubmittingScan ? 'กำลังดำเนินการ...' : 'ยืนยัน'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}