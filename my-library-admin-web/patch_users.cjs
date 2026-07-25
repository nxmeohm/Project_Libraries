const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'Home.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add states
const stateSearch = `    // Users state
    const [usersData, setUsersData] = useState([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);`;

const stateReplace = `    // Users state
    const [usersData, setUsersData] = useState([]);
    const [isUsersLoading, setIsUsersLoading] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState("");
    const [selectedUser, setSelectedUser] = useState(null);
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);`;

content = content.replace(stateSearch, stateReplace);


// 2. Add search input
const headerSearch = `                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex justify-between items-center">
                            <div>
                                <h1 className="text-xl font-semibold">ผู้ใช้งานระบบ</h1>
                                <p className="text-[12.5px] text-slate-400 mt-0.5">จัดการบัญชีนักศึกษาและอนุมัติผู้ที่ต้องการยืมอุปกรณ์</p>
                            </div>
                        </div>`;

const headerReplace = `                        <div className="bg-white border-b border-purple-100 px-8 py-5 sticky top-0 z-10 flex justify-between items-center">
                            <div>
                                <h1 className="text-xl font-semibold">ผู้ใช้งานระบบ</h1>
                                <p className="text-[12.5px] text-slate-400 mt-0.5">จัดการบัญชีนักศึกษาและอนุมัติผู้ที่ต้องการยืมอุปกรณ์</p>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาชื่อ หรือ รหัสนศ." 
                                    className="pl-9 pr-4 py-2 bg-slate-50 border border-purple-100 rounded-xl text-[13px] focus:outline-none focus:border-purple-300 w-64"
                                    value={userSearchQuery}
                                    onChange={(e) => setUserSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>`;

content = content.replace(headerSearch, headerReplace);


// 3. Filter map
const mapSearch = `                                            ) : usersData.length > 0 ? usersData.map((user) => {`;
const mapReplace = `                                            ) : usersData.length > 0 ? usersData.filter((u) => u.student_id.toLowerCase().includes(userSearchQuery.toLowerCase()) || (u.name_th && u.name_th.toLowerCase().includes(userSearchQuery.toLowerCase()))).map((user) => {`;

content = content.replace(mapSearch, mapReplace);


// 4. Row click
const rowSearch = `                                                    <tr key={user.student_id} className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0">`;
const rowReplace = `                                                    <tr 
                                                        key={user.student_id} 
                                                        className="hover:bg-purple-50 transition border-b border-purple-50 last:border-0 cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setIsUserModalOpen(true);
                                                        }}
                                                    >`;

content = content.replace(rowSearch, rowReplace);


// 5. Add Modal at the end of users tab
const modalSearch = `                            </div>
                        </div>
                    </>`;

const modalReplace = `                            </div>
                        </div>
                        
                        {/* User Detail Modal */}
                        {isUserModalOpen && selectedUser && (
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200">
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                        <h3 className="text-lg font-bold text-slate-800">ข้อมูลผู้ใช้งาน</h3>
                                        <button onClick={() => setIsUserModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                            <X className="w-5 h-5 text-slate-500" />
                                        </button>
                                    </div>
                                    <div className="p-6 space-y-4">
                                        <div className="flex flex-col items-center mb-6">
                                            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 mb-3 shadow-inner">
                                                {selectedUser.student_img ? (
                                                    <img src={\`http://localhost:5000/images/\${selectedUser.student_img}\`} alt={selectedUser.name_th} className="w-full h-full object-cover rounded-full" />
                                                ) : (
                                                    <User size={32} />
                                                )}
                                            </div>
                                            <h2 className="text-xl font-bold text-slate-800">{selectedUser.name_th}</h2>
                                            <p className="text-slate-500 text-[13px]">{selectedUser.student_id}</p>
                                        </div>
                                        
                                        <div className="grid grid-cols-3 gap-y-4 text-[13px]">
                                            <div className="text-slate-500 font-medium col-span-1">สาขาวิชา:</div>
                                            <div className="text-slate-800 font-semibold col-span-2">{selectedUser.department || "-"}</div>
                                            
                                            <div className="text-slate-500 font-medium col-span-1">อีเมล:</div>
                                            <div className="text-slate-800 font-semibold col-span-2">{selectedUser.email || "-"}</div>
                                            
                                            <div className="text-slate-500 font-medium col-span-1">เบอร์โทร:</div>
                                            <div className="text-slate-800 font-semibold col-span-2">{selectedUser.phone || "-"}</div>
                                            
                                            <div className="text-slate-500 font-medium col-span-1">สถานะ:</div>
                                            <div className="col-span-2">
                                                <span className={\`px-2.5 py-1 rounded-full text-[11px] font-bold \${
                                                    selectedUser.education_status === 'active' ? 'bg-green-100 text-green-700' :
                                                    selectedUser.education_status === 'suspended' ? 'bg-red-100 text-red-600' :
                                                    'bg-slate-100 text-slate-600'
                                                }\`}>
                                                    {selectedUser.education_status === 'active' ? 'ใช้งานได้' : 
                                                     selectedUser.education_status === 'suspended' ? 'ระงับ' : 
                                                     selectedUser.education_status || 'ไม่ทราบ'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                                        <button onClick={() => setIsUserModalOpen(false)} className="px-5 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-medium text-[13px] hover:bg-slate-50 transition shadow-sm">
                                            ปิดหน้าต่าง
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>`;

// Need to match exactly the end of the users section which ends with 
// `                            </div>\n                        </div>\n                    </>`
// But let's use a regex to be safe on newline characters
content = content.replace(/                            <\/div>\s*<\/div>\s*<\/>/g, modalReplace);


fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully updated Home.jsx");
