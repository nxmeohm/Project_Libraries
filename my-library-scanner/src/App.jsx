import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Use relative path to utilize Vite proxy and bypass Windows Firewall
const API_BASE = '';

/* =============================================
   Beep Sound Generator (Web Audio API)
   ============================================= */
const playBeep = (type = 'success') => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'success') {
      osc.frequency.value = 1200;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.frequency.value = 1600; }, 100);
      setTimeout(() => { osc.stop(); ctx.close(); }, 200);
    } else {
      osc.frequency.value = 300;
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.frequency.value = 200; }, 150);
      setTimeout(() => { osc.stop(); ctx.close(); }, 400);
    }
  } catch (e) { /* silent fail */ }
};

/* =============================================
   Main App
   ============================================= */
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('scanner_token') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Scanner states
  const [isScanning, setIsScanning] = useState(false);
  const [flashType, setFlashType] = useState(null); // 'success' | 'error' | null
  const [toast, setToast] = useState(null); // { message, type }
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [activeQueue, setActiveQueue] = useState(null);
  const [activeQueueDetails, setActiveQueueDetails] = useState(null);

  // Last scan result (replaces scan history)
  const [lastResult, setLastResult] = useState(null); // { status: 'success'|'error', message, code }
  const lastResultTimeout = useRef(null);

  const scannerRef = useRef(null);
  const lastScanTime = useRef(0);
  const toastTimeoutRef = useRef(null);
  const activeQueueRef = useRef(activeQueue);

  // Sync state to ref to avoid closure capture issues in scanner callback
  useEffect(() => {
    activeQueueRef.current = activeQueue;
  }, [activeQueue]);

  /* ---- Auth Fetch Helper ---- */
  const authFetch = useCallback(async (url, options = {}) => {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });
    return res.json();
  }, [token]);

  /* ---- Show Toast ---- */
  const showToast = useCallback((message, type = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---- Show Last Result ---- */
  const showLastResult = useCallback((status, message, code) => {
    if (lastResultTimeout.current) clearTimeout(lastResultTimeout.current);
    setLastResult({ status, message, code });
    lastResultTimeout.current = setTimeout(() => setLastResult(null), 4000);
  }, []);

  /* ---- Login ---- */
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminCode: username, password })
      });
      const data = await res.json();
      if (data.success && data.token) {
        // Admin login successful
        localStorage.setItem('scanner_token', data.token);
        setToken(data.token);
        showToast('เข้าสู่ระบบสำเร็จ', 'success');
      } else {
        setLoginError(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
    } catch (err) {
      setLoginError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
    setIsLoggingIn(false);
  };

  /* ---- Logout ---- */
  const handleLogout = () => {
    stopScanner();
    localStorage.removeItem('scanner_token');
    setToken('');
  };

  /* ---- Process Scanned Code ---- */
  const processCode = useCallback(async (code) => {
    const now = Date.now();
    if (now - lastScanTime.current < 2500) return; // Debounce 2.5s
    if (isProcessing) return;

    lastScanTime.current = now;
    setIsProcessing(true);

    const inputToUse = code.trim();
    const isQueueScan = inputToUse.toUpperCase().startsWith('QUEUE-') || inputToUse.toUpperCase().startsWith('LB');

    try {
      if (isQueueScan) {
        // Mode 1: Set Active Queue and fetch details
        const qIdClean = inputToUse.toUpperCase().replace('QUEUE-', '');
        
        const res = await authFetch(`/api/admin/queue_details.php?queue_id=${qIdClean}`);
        if (res.success) {
            setActiveQueue(qIdClean);
            setActiveQueueDetails(res.data);
            playBeep('success');
            setFlashType('success');
            showToast(`เปิดคิว ${qIdClean} เริ่มสแกนได้เลย`, 'success');
        } else {
            playBeep('error');
            setFlashType('error');
            showToast(res.message || 'ไม่พบข้อมูลคิว', 'error');
        }
        setIsProcessing(false);
        setTimeout(() => setFlashType(null), 500);
        return;
      }

      const currentActiveQueue = activeQueueRef.current;

      // Mode 2: Scanning actual equipment QR code
      let data;
      if (currentActiveQueue) {
        data = await authFetch('/api/admin/pickup_queue.php', {
          method: 'POST',
          body: JSON.stringify({ queue_id: currentActiveQueue, barcode: inputToUse })
        });
      } else {
        data = await authFetch('/api/admin/return_by_barcode.php', {
          method: 'POST',
          body: JSON.stringify({ barcode: inputToUse })
        });
      }

      if (data.success) {
        playBeep('success');
        setFlashType('success');
        showLastResult('success', data.message || 'ทำรายการสำเร็จ', inputToUse);
        
        // Update checklist locally
        if (currentActiveQueue) {
            const res = await authFetch(`/api/admin/queue_details.php?queue_id=${currentActiveQueue}`);
            if (res.success) {
                setActiveQueueDetails(res.data);
            }
        }

        // Auto close active queue if remaining is 0
        if (currentActiveQueue && data.remaining === 0) {
            setActiveQueue(null);
            setActiveQueueDetails(null);
            setTimeout(() => showToast('รายการคิวนี้เสร็จสิ้นแล้ว ✅', 'success'), 1000);
        }
      } else {
        playBeep('error');
        setFlashType('error');
        showLastResult('error', data.message || 'เกิดข้อผิดพลาด', inputToUse);
      }
    } catch (err) {
      playBeep('error');
      setFlashType('error');
      showLastResult('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', inputToUse);
    }

    setTimeout(() => setFlashType(null), 500);
    setIsProcessing(false);
  }, [authFetch, isProcessing, showToast, showLastResult, activeQueue]);

  /* ---- Start Scanner ---- */
  const startScanner = useCallback(async () => {
    if (scannerRef.current) return;
    setCameraError('');
    
    try {
      const scanner = new Html5Qrcode("qr-reader", { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1,
          disableFlip: false
        },
        (decodedText) => {
          processCode(decodedText);
        },
        () => {} // Ignore scan errors (no QR found frames)
      );
      setIsScanning(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง (Camera Permission)');
      scannerRef.current = null;
    }
  }, [processCode]);

  /* ---- Stop Scanner ---- */
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) { /* already stopped */ }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  /* =============================================
     RENDER: Login Screen
     ============================================= */
  if (!token) {
    return (
        <div className="login-screen flex items-center justify-center bg-gradient-to-b from-[#1a0e2e] via-[#2d1854] to-[#4C337D] relative overflow-auto px-5 py-8">
            {/* Background Decorations */}
            <div className="absolute top-[-20%] left-[-30%] w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-3xl" />
            <div className="absolute bottom-[-15%] right-[-20%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="absolute top-[15%] left-[10%] w-2 h-2 bg-white/20 rounded-full login-float" />
            <div className="absolute top-[25%] right-[15%] w-1.5 h-1.5 bg-purple-300/30 rounded-full login-float-delay" />

            {/* Centered Card */}
            <div className="relative z-10 w-full max-w-[380px] flex flex-col items-center">
                {/* Scanner Icon */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/30 to-purple-700/20 backdrop-blur-md border border-white/10 flex items-center justify-center mb-4 shadow-2xl shadow-purple-900/40 login-icon-pulse">
                    <svg className="w-10 h-10 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight mb-0.5">Library Scanner</h1>
                <p className="text-purple-300/70 text-xs font-medium mb-6">ระบบสแกนยืม-คืนอุปกรณ์</p>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="w-full bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-5 shadow-2xl flex flex-col gap-3">
                    
                    <p className="text-white/60 text-[11px] font-medium text-center mb-0.5">เข้าสู่ระบบด้วยบัญชีแอดมิน</p>

                    {/* Username — 6 หลัก */}
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={username} onChange={(e) => setUsername(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder=""
                            className="w-full pl-[52px] pr-5 py-4 text-[16px] bg-white/90 text-slate-800 placeholder-slate-400 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-purple-400/50 transition shadow-sm box-border tracking-widest" required />
                    </div>

                    {/* Password — 13 หลัก */}
                    <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                        </div>
                        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={13} value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 13))} placeholder=""
                            className="w-full pl-[52px] pr-5 py-4 text-[16px] bg-white/90 text-slate-800 placeholder-slate-400 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-purple-400/50 transition shadow-sm box-border tracking-widest" required />
                    </div>

                    {loginError && (
                        <div className="flex items-center gap-2 bg-red-500/15 border border-red-400/20 rounded-lg px-3 py-2">
                            <svg className="w-3.5 h-3.5 text-red-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <p className="text-red-200 text-[12px] font-medium">{loginError}</p>
                        </div>
                    )}

                    <button type="submit" disabled={isLoggingIn}
                        className={`w-full rounded-xl py-3.5 mt-0.5 bg-gradient-to-r from-purple-600 to-purple-800 text-white font-bold text-[14px] shadow-lg shadow-purple-900/40 transition-all box-border flex items-center justify-center gap-2 ${isLoggingIn ? 'opacity-70 cursor-not-allowed' : 'hover:from-purple-500 hover:to-purple-700 active:scale-[.97]'}`}>
                        {isLoggingIn ? (
                            <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>กำลังเข้าสู่ระบบ...</>
                        ) : (
                            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>เข้าสู่ระบบ</>
                        )}
                    </button>
                </form>

                <p className="text-center text-purple-400/40 text-[10px] mt-4 font-medium">สำหรับเจ้าหน้าที่ห้องสมุดเท่านั้น</p>
            </div>
        </div>
    );
  }

  /* =============================================
     RENDER: Scanner Screen
     ============================================= */
  return (
    <div className={`h-full flex flex-col bg-slate-900 relative ${flashType === 'success' ? 'flash-success' : flashType === 'error' ? 'flash-error' : ''}`}>

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md z-20 border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-md shadow-purple-600/20">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <span className="text-slate-800 font-bold text-sm block leading-tight">Library Scanner</span>
            <span className="text-[10px] text-slate-400 font-medium">ระบบยืม-คืนอุปกรณ์</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition active:scale-95 border border-slate-200"
        >
          ออกจากระบบ
        </button>
      </div>

      {/* Camera Viewfinder — takes full remaining space */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* QR Reader Container */}
        <div id="qr-reader" className="absolute inset-0 w-full h-full"></div>

        {/* Scan Frame Overlay */}
        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40"></div>

            {/* Scan window */}
            <div className="relative w-72 h-72" style={{ marginTop: activeQueue ? '-20%' : '0' }}>
              {/* Clear center */}
              <div className="absolute inset-0 bg-transparent" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}></div>

              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-purple-400 rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-purple-400 rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-purple-400 rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-purple-400 rounded-br-xl"></div>

              {/* Animated scan line */}
              <div className="scan-line absolute left-3 right-3 h-[3px] bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full shadow-[0_0_12px_rgba(168,85,247,0.7)]"></div>
            </div>

            {/* Status hint (when no queue active) */}
            {!activeQueue && !lastResult && (
              <div className="absolute bottom-8 left-0 right-0 text-center">
                <p className="text-white/90 text-sm font-semibold bg-black/50 inline-block px-5 py-2.5 rounded-full backdrop-blur-sm">
                  {isProcessing ? '⏳ กำลังประมวลผล...' : '📷 สแกน QR Code คิว หรือ อุปกรณ์ที่นำมาคืน'}
                </p>
              </div>
            )}

            {/* ====== SCAN RESULT OVERLAY ====== */}
            {lastResult && (
              <div className="result-overlay absolute inset-0 flex items-center justify-center z-40 pointer-events-none" style={{ marginTop: activeQueue ? '-20%' : '0' }}>
                <div className={`result-card flex flex-col items-center gap-3 px-8 py-6 rounded-3xl backdrop-blur-xl shadow-2xl max-w-[85%] ${
                  lastResult.status === 'success' 
                    ? 'bg-green-500/90 shadow-green-500/40' 
                    : 'bg-red-500/90 shadow-red-500/40'
                }`}>
                  {/* Icon */}
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    lastResult.status === 'success' ? 'bg-white/25' : 'bg-white/25'
                  }`}>
                    {lastResult.status === 'success' ? (
                      <svg className="w-10 h-10 text-white result-icon-pop" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-10 h-10 text-white result-icon-pop" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  {/* Message */}
                  <p className="text-white font-bold text-base text-center leading-snug">{lastResult.message}</p>
                  <p className="text-white/60 text-[11px] font-mono">{lastResult.code}</p>
                </div>
              </div>
            )}

            {/* Active Queue Details Panel */}
            {activeQueue && activeQueueDetails && (
              <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] z-30 flex flex-col overflow-hidden transition-all duration-300 pointer-events-auto" style={{ maxHeight: '45%' }}>
                {/* Header */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-slate-50 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-md shadow-purple-600/20">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider">กำลังจัดเตรียม</p>
                      <p className="text-sm font-bold text-slate-800">{activeQueue}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">{activeQueueDetails.total_items} ชิ้น</span>
                    <button
                      onClick={() => { setActiveQueue(null); setActiveQueueDetails(null); showToast('ปิดคิวเรียบร้อย', 'success'); }}
                      className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-[11px] font-bold hover:bg-red-100 transition active:scale-95 border border-red-100"
                    >
                      ปิด
                    </button>
                  </div>
                </div>
                
                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-3 pb-6">
                  <div className="space-y-2">
                    {activeQueueDetails.items.map((item, index) => (
                      <div key={`${item.id}-${index}`} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all duration-300 ${
                        item.status === 'borrowed' 
                          ? 'bg-green-50 border-green-200 shadow-sm shadow-green-500/10' 
                          : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                          item.status === 'borrowed' 
                            ? 'bg-green-500 text-white shadow-md shadow-green-500/30' 
                            : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}>
                          {item.status === 'borrowed' ? (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <span className="text-[10px] font-bold">{index + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-xs truncate ${item.status === 'borrowed' ? 'text-green-700' : 'text-slate-700'}`}>{item.name}</p>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.category}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Camera Error */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center z-20 p-8 bg-slate-50">
            <div className="bg-white border border-red-100 rounded-3xl p-8 text-center max-w-sm shadow-xl">
              <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">เปิดกล้องไม่ได้</h3>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">{cameraError}</p>
              <button
                onClick={() => { setCameraError(''); startScanner(); }}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-2xl text-sm font-bold shadow-lg shadow-purple-600/20 transition active:scale-95"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          </div>
        )}

        {/* Camera not started — Welcome Screen */}
        {!isScanning && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-6 bg-gradient-to-b from-[#F8F6FC] to-[#EDE8F5]">
            {/* Decorative circles */}
            <div className="absolute top-[-5%] right-[-15%] w-64 h-64 bg-purple-200/30 rounded-full blur-3xl"></div>
            <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 bg-purple-300/20 rounded-full blur-3xl"></div>

            <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
              {/* Scanner Icon */}
              <div className="w-28 h-28 bg-white rounded-[28px] flex items-center justify-center mb-8 shadow-xl shadow-purple-200/40 border border-purple-100/50">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-purple-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-12 h-12 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-slate-800 mb-2">พร้อมสแกน</h2>
              <p className="text-slate-500 text-sm mb-10 leading-relaxed px-4">
                กดปุ่มด้านล่างเพื่อเปิดกล้อง<br/>สแกน QR Code ยืม-คืนอุปกรณ์
              </p>

              {/* Start Button */}
              <button
                onClick={startScanner}
                className="w-full py-4 bg-gradient-to-r from-[#5B3A8C] to-[#7C52B8] text-white rounded-2xl text-[16px] font-bold shadow-xl shadow-purple-700/25 hover:shadow-purple-700/40 transition-all active:scale-[0.97] flex items-center justify-center gap-3"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                เปิดกล้องสแกน
              </button>

              {/* Info chips */}
              <div className="flex gap-3 mt-8">
                <div className="flex items-center gap-1.5 bg-white/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-purple-100/50">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-[11px] text-slate-500 font-medium">จ่ายอุปกรณ์</span>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div className="flex items-center gap-1.5 bg-white/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-purple-100/50">
                  <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                  <span className="text-[11px] text-slate-500 font-medium">รับคืนอุปกรณ์</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 left-4 right-4 z-50 toast-slide-up">
          <div className={`px-5 py-4 rounded-2xl text-center font-bold text-sm shadow-2xl ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/30'
              : 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-red-500/30'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
