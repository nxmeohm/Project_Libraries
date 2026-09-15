const fs = require('fs');
const pool = require('./db');

async function generateQRCodes() {
    try {
        const [items] = await pool.query(`
            SELECT ei.full_asset_code, e.name, e.category, e.equipment_img, ei.status, e.equipment_id 
            FROM equipment_items ei 
            JOIN equipments e ON ei.equipment_id = e.equipment_id
            ORDER BY e.category, e.name, ei.full_asset_code
        `);

        let html = `
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ระบบจัดการ QR Code อุปกรณ์</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Sarabun', sans-serif; background: #f8fafc; }
        @media print {
            body { background: white; }
            .no-print { display: none !important; }
            .print-container { width: 100%; padding: 0; }
            .page-break { page-break-after: always; }
        }
        .active-tab { background-color: #f3e8ff; border-right: 4px solid #9333ea; font-weight: 600; color: #7e22ce; }
        .tab-item:hover:not(.active-tab) { background-color: #f1f5f9; }
    </style>
</head>
<body class="h-screen flex overflow-hidden">

    <!-- Sidebar (List of Equipments) -->
    <div class="w-80 bg-white border-r border-slate-200 flex flex-col h-full no-print shadow-sm z-10">
        <div class="p-5 border-b border-slate-200 bg-slate-50">
            <h1 class="text-lg font-bold text-slate-800">จัดการ QR Code</h1>
            <p class="text-sm text-slate-500">เลือกอุปกรณ์เพื่อดู/พิมพ์ QR Code</p>
        </div>
        <div class="flex-1 overflow-y-auto" id="equipment-list">
            <!-- JS will populate this -->
        </div>
    </div>

    <!-- Modal for QR Code -->
    <div id="qr-modal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 hidden flex items-center justify-center no-print">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col scale-95 transition-transform" id="qr-modal-content">
            <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 class="font-bold text-slate-800 text-lg">QR Code</h3>
                <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition">
                    ✕
                </button>
            </div>
            <div class="p-8 flex flex-col items-center">
                <div id="modal-qr-img" class="mb-5 p-3 bg-white rounded-xl shadow-sm border border-slate-200"></div>
                <p id="modal-eq-name" class="font-bold text-slate-800 text-[14px] text-center mb-1"></p>
                <p id="modal-asset-code" class="text-purple-600 font-mono font-bold tracking-wider"></p>
            </div>
            <div class="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button onclick="window.print()" class="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold hover:bg-purple-700 shadow-md transition">🖨️ พิมพ์</button>
                <button onclick="closeModal()" class="flex-1 bg-white border border-slate-200 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-50 transition">ปิด</button>
            </div>
        </div>
    </div>

    <!-- Main Content (Table) -->
    <div class="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 print-container">
        <!-- Header -->
        <div class="p-5 border-b border-slate-200 bg-white flex justify-between items-center no-print shadow-sm">
            <div class="flex items-center gap-4">
                <div id="header-img-container" class="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 hidden"></div>
                <div>
                    <h2 id="header-title" class="text-xl font-bold text-slate-800">กรุณาเลือกอุปกรณ์จากเมนูด้านซ้าย</h2>
                    <p id="header-subtitle" class="text-sm text-slate-500"></p>
                </div>
            </div>
        </div>

        <!-- Table Area -->
        <div class="flex-1 overflow-y-auto p-8" id="table-area">
            <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden hidden" id="data-table-container">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-50 border-b border-slate-200 text-slate-600 text-[13px] uppercase tracking-wider">
                            <th class="px-6 py-4 font-semibold w-16 text-center">ลำดับ</th>
                            <th class="px-6 py-4 font-semibold">รหัสครุภัณฑ์ (Asset Code)</th>
                            <th class="px-6 py-4 font-semibold w-32 text-center">สถานะ</th>
                            <th class="px-6 py-4 font-semibold w-32 text-center no-print">จัดการ</th>
                            <th class="px-6 py-4 font-semibold w-40 text-center hidden print:table-cell">QR Code</th>
                        </tr>
                    </thead>
                    <tbody id="table-body" class="divide-y divide-slate-100">
                        <!-- JS will populate this -->
                    </tbody>
                </table>
            </div>
            <div id="empty-state" class="h-full flex flex-col items-center justify-center text-slate-400">
                <div class="text-6xl mb-4 opacity-50">👈</div>
                <p>เลือกอุปกรณ์จากแถบด้านซ้ายเพื่อดูตาราง QR Code</p>
            </div>
        </div>
    </div>

    <script>
        const rawItems = ${JSON.stringify(items)};
        
        // Group items by equipment_id
        const equipments = {};
        rawItems.forEach(item => {
            if (!equipments[item.equipment_id]) {
                equipments[item.equipment_id] = {
                    id: item.equipment_id,
                    name: item.name,
                    category: item.category,
                    image: item.equipment_img,
                    items: []
                };
            }
            equipments[item.equipment_id].items.push(item);
        });

        const eqArray = Object.values(equipments);
        
        // Render Sidebar
        const listContainer = document.getElementById('equipment-list');
        let currentSelectedId = null;

        eqArray.forEach(eq => {
            const btn = document.createElement('button');
            btn.className = "tab-item w-full text-left px-5 py-4 border-b border-slate-100 transition flex items-center gap-3";
            btn.id = 'tab-' + eq.id;
            
            let imgHtml = '<div class="w-10 h-10 bg-slate-100 rounded-md shrink-0 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400">ไม่มีรูป</div>';
            if (eq.image) {
                imgHtml = \`<div class="w-10 h-10 bg-white rounded-md shrink-0 border border-slate-200 flex items-center justify-center overflow-hidden p-1">
                                <img src="http://localhost:5000/\${eq.image}" class="max-w-full max-h-full object-contain">
                           </div>\`;
            }

            btn.innerHTML = \`
                \${imgHtml}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-slate-800 truncate">\${eq.name}</p>
                    <p class="text-xs text-slate-500 mt-0.5">\${eq.category} • \${eq.items.length} ชิ้น</p>
                </div>
            \`;

            btn.onclick = () => selectEquipment(eq.id);
            listContainer.appendChild(btn);
        });

        function selectEquipment(eqId) {
            // Update tabs
            if (currentSelectedId) {
                document.getElementById('tab-' + currentSelectedId).classList.remove('active-tab');
            }
            currentSelectedId = eqId;
            document.getElementById('tab-' + eqId).classList.add('active-tab');

            const eq = equipments[eqId];

            // Update Header
            document.getElementById('empty-state').classList.add('hidden');
            document.getElementById('data-table-container').classList.remove('hidden');
            
            document.getElementById('header-title').textContent = eq.name;
            document.getElementById('header-subtitle').textContent = \`หมวดหมู่: \${eq.category} | จำนวนทั้งหมด: \${eq.items.length} ชิ้น\`;

            const imgCont = document.getElementById('header-img-container');
            if (eq.image) {
                imgCont.classList.remove('hidden');
                imgCont.innerHTML = \`<img src="http://localhost:5000/\${eq.image}" class="max-w-full max-h-full object-contain">\`;
            } else {
                imgCont.classList.add('hidden');
            }

            // Render Table
            const tbody = document.getElementById('table-body');
            tbody.innerHTML = '';

            eq.items.forEach((item, idx) => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 transition";
                
                let statusBadge = '';
                if (item.status === 'available') statusBadge = '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-block">พร้อมใช้งาน</span>';
                else if (item.status === 'borrowed') statusBadge = '<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-block">ถูกยืม</span>';
                else statusBadge = \`<span class="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-block">\${item.status}</span>\`;

                tr.innerHTML = \`
                    <td class="px-6 py-4 text-center text-slate-500 font-medium">\${idx + 1}</td>
                    <td class="px-6 py-4">
                        <span class="font-mono text-purple-700 font-bold tracking-wide">\${item.full_asset_code}</span>
                    </td>
                    <td class="px-6 py-4 text-center">\${statusBadge}</td>
                    
                    <!-- Action Button (Hidden on print) -->
                    <td class="px-6 py-4 text-center no-print">
                        <button onclick="openModal('\${item.full_asset_code}', '\${eq.name.replace(/'/g, "\\'")}')" class="px-4 py-2 bg-[#f3e8ff] text-[#7e22ce] rounded-lg font-semibold text-xs hover:bg-[#e9d5ff] transition border border-[#d8b4fe]">
                            👁️ ดู QR Code
                        </button>
                    </td>

                    <!-- Real QR Code (Hidden on screen, shown only on print) -->
                    <td class="px-6 py-4 hidden print:flex justify-center">
                        <div id="print-qr-\${item.full_asset_code}"></div>
                    </td>
                \`;
                tbody.appendChild(tr);

                // Generate Print QR
                setTimeout(() => {
                    new QRCode(document.getElementById(\`print-qr-\${item.full_asset_code}\`), {
                        text: item.full_asset_code,
                        width: 80,
                        height: 80,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.H
                    });
                }, 10);
            });
        }

        // Modal Logic
        let modalQrInstance = null;
        function openModal(assetCode, eqName) {
            document.getElementById('modal-eq-name').textContent = eqName;
            document.getElementById('modal-asset-code').textContent = assetCode;
            
            const qrCont = document.getElementById('modal-qr-img');
            qrCont.innerHTML = '';
            
            modalQrInstance = new QRCode(qrCont, {
                text: assetCode,
                width: 200,
                height: 200,
                colorDark : "#000000",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });

            const modal = document.getElementById('qr-modal');
            const content = document.getElementById('qr-modal-content');
            modal.classList.remove('hidden');
            
            // Animation
            setTimeout(() => {
                content.classList.remove('scale-95');
                content.classList.add('scale-100');
            }, 10);
        }

        function closeModal() {
            const modal = document.getElementById('qr-modal');
            const content = document.getElementById('qr-modal-content');
            
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
            
            setTimeout(() => {
                modal.classList.add('hidden');
                if (modalQrInstance) {
                    modalQrInstance.clear();
                }
            }, 150);
        }

        // --- Real-time Status Polling ---
        async function fetchStatuses() {
            try {
                const res = await fetch('http://localhost:5000/api/admin/equipment_items/status');
                const json = await res.json();
                if (json.success) {
                    const statusMap = {};
                    json.data.forEach(item => {
                        statusMap[item.full_asset_code] = item.status;
                    });
                    
                    let hasChanges = false;
                    rawItems.forEach(item => {
                        if (statusMap[item.full_asset_code] && item.status !== statusMap[item.full_asset_code]) {
                            item.status = statusMap[item.full_asset_code];
                            hasChanges = true;
                        }
                    });
                    
                    if (hasChanges && currentSelectedId) {
                        selectEquipment(currentSelectedId); // Re-render table with new statuses
                    }
                }
            } catch (err) {
                // Silently fail if server is unreachable
            }
        }
        
        // Poll every 3 seconds
        setInterval(fetchStatuses, 3000);
    </script>
</body>
</html>
        `;

        fs.writeFileSync('../qr_codes_list.html', html, 'utf-8');
        console.log("Generated ../qr_codes_list.html successfully!");
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

generateQRCodes();
