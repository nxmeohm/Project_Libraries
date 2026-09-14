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
  const [scanHistory, setScanHistory] = useState([]);
  const [flashType, setFlashType] = useState(null); // 'success' | 'error' | null
  const [toast, setToast] = useState(null); // { message, type }
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const scannerRef = useRef(null);
  const lastScanTime = useRef(0);
  const toastTimeoutRef = useRef(null);

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
    setScanHistory([]);
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

    const historyEntry = {
      id: Date.now(),
      code: inputToUse,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type: isQueueScan ? 'จ่ายอุปกรณ์' : 'รับคืน',
      status: 'processing',
      message: 'กำลังดำเนินการ...'
    };

    setScanHistory(prev => [historyEntry, ...prev].slice(0, 10));

    try {
      let data;
      if (isQueueScan) {
        const qIdClean = inputToUse.toUpperCase().replace('QUEUE-', '');
        data = await authFetch('/api/admin/pickup_queue.php', {
          method: 'POST',
          body: JSON.stringify({ queue_id: qIdClean, barcode: 'AUTO' })
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
        showToast(data.message || (isQueueScan ? 'จ่ายอุปกรณ์สำเร็จ ✅' : 'รับคืนอุปกรณ์สำเร็จ ✅'), 'success');
        setScanHistory(prev => prev.map(h => h.id === historyEntry.id ? { ...h, status: 'success', message: data.message || 'สำเร็จ' } : h));
      } else {
        playBeep('error');
        setFlashType('error');
        showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
        setScanHistory(prev => prev.map(h => h.id === historyEntry.id ? { ...h, status: 'error', message: data.message || 'ล้มเหลว' } : h));
      }
    } catch (err) {
      playBeep('error');
      setFlashType('error');
      showToast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 'error');
      setScanHistory(prev => prev.map(h => h.id === historyEntry.id ? { ...h, status: 'error', message: 'เชื่อมต่อไม่ได้' } : h));
    }

    setTimeout(() => setFlashType(null), 500);
    setIsProcessing(false);
  }, [authFetch, isProcessing, showToast]);

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

  /* ---- Auto-start camera when logged in ---- */
  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => startScanner(), 500);
      return () => clearTimeout(timer);
    }
  }, [token]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  /* =============================================
     RENDER: Login Screen
     ============================================= */
  if (!token) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-50">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mx-auto mb-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
            <svg className="w-10 h-10 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">Library Scanner</h1>
          <p className="text-slate-500 text-sm mt-1">เครื่องสแกน QR Code สำหรับผู้ดูแลระบบ</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">ชื่อผู้ใช้ (Admin)</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="กรอกชื่อผู้ใช้"
              className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition text-base shadow-sm"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition text-base shadow-sm"
              required
              autoComplete="current-password"
            />
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-3.5 bg-purple-600 text-white font-bold rounded-xl text-base shadow-lg shadow-purple-600/30 hover:bg-purple-700 hover:shadow-purple-600/40 transition disabled:opacity-50 active:scale-[0.98]"
          >
            {isLoggingIn ? '⏳ กำลังเข้าสู่ระบบ...' : '🔓 เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="text-slate-400 text-xs mt-8">เฉพาะผู้ดูแลระบบเท่านั้น</p>
      </div>
    );
  }

  /* =============================================
     RENDER: Scanner Screen
     ============================================= */
  return (
    <div className={`h-full flex flex-col bg-slate-100 relative ${flashType === 'success' ? 'flash-success' : flashType === 'error' ? 'flash-error' : ''}`}>

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur-md z-20 border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <span className="text-slate-800 font-bold text-sm">Library Scanner</span>
        </div>
        <button
          onClick={handleLogout}
          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition active:scale-95 border border-red-100"
        >
          ออกจากระบบ
        </button>
      </div>

      {/* Camera Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* QR Reader Container */}
        <div id="qr-reader" className="absolute inset-0 w-full h-full"></div>

        {/* Scan Frame Overlay */}
        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            {/* Dark corners overlay */}
            <div className="absolute inset-0 bg-black/40"></div>

            {/* Scan window */}
            <div className="relative w-72 h-72">
              {/* Clear center */}
              <div className="absolute inset-0 bg-transparent" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}></div>

              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-purple-400 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-purple-400 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-purple-400 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-purple-400 rounded-br-lg"></div>

              {/* Animated scan line */}
              <div className="scan-line absolute left-2 right-2 h-[3px] bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div>
            </div>

            {/* Status text */}
            <div className="absolute bottom-8 left-0 right-0 text-center">
              <p className="text-white/80 text-sm font-semibold">
                {isProcessing ? '⏳ กำลังประมวลผล...' : '📷 เล็งกล้องไปที่ QR Code / Barcode'}
              </p>
            </div>
          </div>
        )}

        {/* Camera Error */}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center z-20 p-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center max-w-sm shadow-xl">
              <div className="text-4xl mb-3">📵</div>
              <p className="text-red-600 text-sm font-semibold">{cameraError}</p>
              <button
                onClick={() => { setCameraError(''); startScanner(); }}
                className="mt-4 px-6 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 shadow-md shadow-purple-600/20 transition active:scale-95"
              >
                ลองใหม่
              </button>
            </div>
          </div>
        )}

        {/* Camera not started */}
        {!isScanning && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center z-20 p-8 bg-slate-100">
            <div className="text-center">
              <div className="text-5xl mb-4 opacity-50">📸</div>
              <p className="text-slate-500 text-sm mb-4 font-medium">กล้องยังไม่เปิด</p>
              <button
                onClick={startScanner}
                className="px-8 py-3 bg-purple-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-600/30 hover:bg-purple-700 transition active:scale-95"
              >
                เปิดกล้อง
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scan History Panel */}
      <div className="bg-white/95 backdrop-blur-md border-t border-slate-200 z-20 shadow-[0_-4px_20px_rgb(0,0,0,0.05)]" style={{ maxHeight: '35vh' }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">ประวัติการสแกน</h3>
          {scanHistory.length > 0 && (
            <button
              onClick={() => setScanHistory([])}
              className="text-[10px] text-slate-400 hover:text-slate-600 transition"
            >
              ล้างทั้งหมด
            </button>
          )}
        </div>

        <div className="history-scroll" style={{ maxHeight: 'calc(35vh - 40px)' }}>
          {scanHistory.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              ยังไม่มีประวัติการสแกน
            </div>
          ) : (
            scanHistory.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0">
                {/* Status Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                  item.status === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
                  item.status === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
                  'bg-amber-50 text-amber-600 border border-amber-100'
                }`}>
                  {item.status === 'success' ? '✅' : item.status === 'error' ? '❌' : '⏳'}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.type === 'จ่ายอุปกรณ์' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                    }`}>
                      {item.type}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">{item.time}</span>
                  </div>
                  <p className="text-xs text-slate-800 mt-0.5 truncate font-mono font-medium">{item.code}</p>
                  <p className={`text-[11px] mt-0.5 ${
                    item.status === 'success' ? 'text-green-600' :
                    item.status === 'error' ? 'text-red-600' :
                    'text-amber-600'
                  }`}>
                    {item.message}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
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
