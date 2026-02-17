console.log("APP.JS LOADED ✅");
const API = "http://localhost:8080/api";

const state = {
  token: localStorage.getItem("token") || "",
  user: JSON.parse(localStorage.getItem("user") || "null"),
  rows: [],
  editingId: null,
  q: ""
};
state.activePanel = "employees"; // employees | admin | courses | vacations | absence

// Map sections to Arabic titles (blue headers)
const SECTION_TITLES = {
  leadership: "القيادة",
  level9: "مستوى 9",
  level8: "مستوى 8",
  level7: "مستوى 7",
  level6: "مستوى 6",
  level5: "مستوى 5",
  level4: "مستوى 4",
  level3: "مستوى 3",
  level2: "مستوى 2",
  level1: "مستوى 1",
  trainee: "مستوى متدرب",
};
const PROMO_REQ = {
  trainee: { days: 4,  points: 4,  hours: 8  },
  level1:  { days: 7,  points: 8,  hours: 10 },
  level2:  { days: 14, points: 14, hours: 20 },
  level3:  { days: 21, points: 21, hours: 30 },
  level4:  { days: 28, points: 28, hours: 40 },
};
function parseDateFlexible(s){
  const v = String(s||"").trim();
  if (!v || v === "0000-00-00") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y,m,d] = v.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [m,d,y] = v.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  return null;
}

function addDays(dateObj, days){
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d){
  if (!d) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function isPromotionMet(row){
  const req = PROMO_REQ[row.section];
  if (!req) return { ok:false, due:null };

  const start = parseDateFlexible(row.reg_date);
  if (!start) return { ok:false, due:null };

  const due = addDays(start, req.days);
  const today = new Date();

  const pts = Number(row.points || 0);
  const hrs = Number(row.hours  || 0);

  const ok = (today >= due) && (pts >= req.points) && (hrs >= req.hours);
  return { ok, due, req };
}


// Which badge color to use (roughly like your screenshot)
function badgeClass(code) {
  const n = parseInt(String(code).replace(/[^\d]/g,""), 10);
  if (Number.isFinite(n) && n >= 100) return "badge blue";
  return (n % 2 === 0) ? "badge" : "badge blue";
}

/* ---------- AUTO: CODE -> SECTION/SUBGROUP/RANK ---------- */

function codeToNumber(code){
  const digits = String(code || "").replace(/[^\d]/g, "");
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : NaN;
}

// user types only numbers, we display: G-###
function formatCodeInput(value){
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";

  // IMPORTANT: keep only last 3 digits (max 999)
  const last3 = digits.slice(-3);

  return "G-" + last3.padStart(3, "0");
}


// decide section by number
function getSectionFromCode(code){
  const n = codeToNumber(code);
  if (!Number.isFinite(n)) return "leadership";
  if (n >= 1 && n <= 13) return "leadership";
  if (n >= 14 && n <= 23) return "level9";
  if (n >= 24 && n <= 46) return "level8";
  if (n >= 47 && n <= 69) return "level7";
  if (n >= 70 && n <= 99) return "level6";
  if (n >= 100 && n <= 144) return "level5";
  if (n >= 145 && n <= 184) return "level4";
  if (n >= 185 && n <= 269) return "level3";
  if (n >= 270 && n <= 399) return "level2";
  if (n >= 400 && n <= 699) return "level1";
  if (n >= 700 && n <= 999) return "trainee";
  return "leadership";
}

// default rank per section
function getRankForSection(sectionKey){
  if (sectionKey === "trainee") return "متدرب";
  if (sectionKey === "level1") return "فني";
  if (sectionKey === "level2") return "فني";
  if (sectionKey === "level3") return "فني ورش";
  if (sectionKey === "level7") return "اشراف ميداني";
  if (sectionKey === "level8") return "اشراف ميداني";
  if (sectionKey === "level9") return "مشرف عام";
  if (sectionKey === "القيادة") return "القيادة";
  // القيادة + level4/5/6 will be handled separately
  return "";
}

// If you want selection for 4/5/6: make sure HTML has <select id="fRankChoice">
function applyAutoSectionSubgroupAndRank(){
  const codeEl = $("fCode");
  const secEl = $("fSection");
  const subEl = $("fSubgroup");
  const rankEl = $("fRank");
  const choiceEl = $("fRankChoice"); // optional

  // 1) enforce code format
  const formatted = formatCodeInput(codeEl.value);
  if (codeEl.value !== formatted) codeEl.value = formatted;

  // 2) section
  const sec = getSectionFromCode(formatted);
  secEl.value = sec;

  // 3) subgroup title
  subEl.value = SECTION_TITLES[sec] || "";

  // 4) rank logic
  const needsChoice = (sec === "level4" || sec === "level5" || sec === "level6");

  if (needsChoice && choiceEl) {
    choiceEl.classList.remove("hidden");
    rankEl.value = choiceEl.value || "اشراف منطقة";
  } else {
    if (choiceEl) choiceEl.classList.add("hidden");
    rankEl.value = getRankForSection(sec) || rankEl.value;
  }
}

/* ---------- AUTO SUBGROUP FROM RANK ---------- */
function getSubgroupFromRank(rank) {
  const r = String(rank || "").trim();

  // ✅ عدّل الكلمات هنا حسب رتبك
  const map = {
    "القيادة": "القيادة ",
    "مستوى 9": "مستوى 9",
    "مستوى 8": "مستوى 8",
    "مستوى 7": "مستوى 7",
    "مستوى 6": "مستوى 6",
    "مستوى 5": "مستوى 5",
    "مستوى 4": "مستوى 4",
    "مستوى 3": "مستوى 3",
    "مستوى 2": "مستوى 2",
    "مستوى 1": "مستوى 1",
    "متدرب": "مستوى متدرب"
  };

  // تطابق كامل
  if (map[r]) return map[r];

  // تطابق جزئي (لو الرتبة فيها كلمات إضافية)
  for (const k of Object.keys(map)) {
    if (r.includes(k)) return map[k];
  }

  return "";
}

function $(id){ return document.getElementById(id); }

function setAuthUI(){
  const who = $("whoami");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");
  const adminPanel = $("adminPanel");

  if (state.user) {
    who.textContent = `👤 ${state.user.username} (${state.user.role})`;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
  } else {
    who.textContent = "غير مسجل";
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
  }
// Don't auto-show admin panel. We'll open it only when you click the blue button.
// Only hide admin panel if we are NOT on the admin tab
if (state.activePanel !== "admin") adminPanel.classList.add("hidden");
}

async function api(path, opts = {}){
  const headers = opts.headers || {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadRows(){
  const data = await api(`/personnel?q=${encodeURIComponent(state.q)}`);
  state.rows = data.rows || [];
  render();
}

function groupRows(){
  // { section: { subgroup: [rows] } }
  const out = {};
  for (const r of state.rows) {
    if (!out[r.section]) out[r.section] = {};
    if (!out[r.section][r.subgroup]) out[r.section][r.subgroup] = [];
    out[r.section][r.subgroup].push(r);
  }
  return out;
}

function canEdit(){
  return state.user && (state.user.role === "admin" || state.user.role === "editor");
}
function canDelete(){
  return state.user && state.user.role === "admin";
}
function setActiveTab(tab){
 const map = {
  employees: "tabEmployees",
  courses: "tabCourses",
  vacations: "tabVacations",
  absence: "tabAbsence",
  admin: "adminToggleBtn"
};

  // update button styles
  Object.values(map).forEach(id => $(id).classList.remove("active"));
  if (map[tab]) $(map[tab]).classList.add("active");

  // show/hide panels
  $("employeesPanel").classList.toggle("hidden", tab !== "employees");
  $("coursesPanel").classList.toggle("hidden", tab !== "courses");
  $("vacationsPanel").classList.toggle("hidden", tab !== "vacations");
  $("absencePanel").classList.toggle("hidden", tab !== "absence");

  // admin panel is separate
  $("adminPanel").classList.toggle("hidden", tab !== "admin");

  state.activePanel = tab;
}

function render(){
  setAuthUI();

  const grouped = groupRows();
  const content = $("content");
  content.innerHTML = "";
  // ✅ If there are no employees rows yet, show a message + "Add first row" button
if (!state.rows || state.rows.length === 0) {
  content.innerHTML = `
    <div class="panel">
      <div class="panelHeader">
        <h2>لا توجد بيانات حالياً</h2>
        <p class="muted">أضف أول سجل ليظهر جدول "الموظفون".</p>
        ${canEdit() ? `<button class="btn primary" id="addFirstRowBtn">+ إضافة أول سجل</button>` : ""}
      </div>
    </div>
  `;

  if (canEdit()) {
    $("addFirstRowBtn").addEventListener("click", () => {
      openRowModal({ section: "leadership", subgroup: "" });
    });
  }
  return;
}

  for (const sectionKey of Object.keys(SECTION_TITLES)) {
    const subgroups = grouped[sectionKey];
    if (!subgroups) continue;

    const sectionEl = document.createElement("section");
    sectionEl.className = "section";
    sectionEl.innerHTML = `
      <div class="sectionTitle">${SECTION_TITLES[sectionKey]}</div>
    `;

    for (const [subTitle, rows] of Object.entries(subgroups)) {
      const subgroupEl = document.createElement("div");
      subgroupEl.className = "subgroup";

      const tools = "";

      subgroupEl.innerHTML = `
        <div class="subgroupTitle">
          ${tools}
          ${subTitle}
        </div>
        <div class="tableWrap">
          <table>
            <thead>
              <tr>
<th>اسم الموظف</th>
<th>المسمى الوظيفي</th>
<th>ديسكورد ID</th>
<th>الكود</th>
<th>النقاط</th>
<th>الساعات</th>
<th>استيفاء الترقية</th>
<th>ملاحظات</th>
<th>تاريخ اخر ترقية</th>
${canEdit() ? "<th>إجراء</th>" : ""}

              </tr>
            </thead>
            <tbody>
              ${rows.map(r => rowHtml(r)).join("")}
            </tbody>
          </table>
        </div>
      `;

      sectionEl.appendChild(subgroupEl);
    }

    content.appendChild(sectionEl);
  }


  // bind edit/delete
  document.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = Number(btn.dataset.edit);
      const r = state.rows.find(x => x.id === id);
      if (r) openRowModal(r);
    });
  });
  document.querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = Number(btn.dataset.del);
      if (!canDelete()) return;
      if (!confirm("حذف السجل؟")) return;
      await api(`/personnel/${id}`, { method:"DELETE" });
      await loadRows();
    });
  });
}
function formatCode(code){
  if (!code) return "";

  // remove anything except numbers
  const n = String(code).replace(/[^\d]/g, "");

  // pad to 3 digits
  const padded = n.padStart(3, "0");

  return `G-${padded}`;
}
function displayCode(code){
  const s = String(code || "").trim();
  // if already looks like G-xxxxx keep it
  if (/^G-\d+$/.test(s)) return s;

  // otherwise format numbers to G-###
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return "";
  return "G-" + digits.padStart(3, "0");
}

function rowHtml(r){
  const action = canEdit() ? `
    <td>
      <button class="btn" data-edit="${r.id}">تعديل</button>
      ${canDelete() ? `<button class="btn danger" data-del="${r.id}">حذف</button>` : ""}
    </td>` : "";
const promo = isPromotionMet(r);
const promoCell = promo.due
  ? `${promo.ok ? "✅" : "❌"} <span class="muted small">(${fmtDate(promo.due)})</span>`
  : "—";

return `
  <tr>
    <td><b>${escapeHtml(r.name)}</b></td>
    <td>${escapeHtml(r.rank)}</td>
    <td>${escapeHtml(r.discord_id)}</td>
    <td><span class="${badgeClass(r.code)}">${escapeHtml(displayCode(r.code))}</span></td>
    <td>${Number(r.points||0)}</td>
    <td>${Number(r.hours||0)}</td>
    <td>${promoCell}</td>
    <td class="muted">${escapeHtml(r.notes || "")}</td>
    <td class="muted">${escapeHtml((r.reg_date && r.reg_date !== "0000-00-00") ? r.reg_date : "-")}</td>
    ${action}
  </tr>
`;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

/* ---------- Row modal ---------- */
function openRowModal(row){
  state.editingId = row.id || null;

  $("modalTitle").textContent = state.editingId ? "تعديل سجل" : "إضافة سجل";
  $("fSection").value = row.section || "leadership";
  $("fSubgroup").value = row.subgroup || "";
  $("fCode").value = row.code || "";
  $("fRank").value = row.rank || "";
  $("fName").value = row.name || "";
  $("fDiscord").value = row.discord_id || "";
  $("fNotes").value = row.notes || "";
  $("fDate").value = row.reg_date || "0000-00-00";
  $("modal").classList.remove("hidden");
  // ✅ بعد تعبئة القيم (خصوصاً fCode)
applyAutoSectionSubgroupAndRank();
}

function closeRowModal(){
  $("modal").classList.add("hidden");
  state.editingId = null;
}

$("closeModal").addEventListener("click", closeRowModal);
$("cancelRowBtn").addEventListener("click", closeRowModal);
// Auto-fill subgroup when typing rank
$("fCode").addEventListener("input", () => {
  applyAutoSectionSubgroupAndRank();
});

// if you have rank choice for 4/5/6
const rankChoice = document.getElementById("fRankChoice");
if (rankChoice) {
  rankChoice.addEventListener("change", () => {
    applyAutoSectionSubgroupAndRank();
  });
}
$("saveRowBtn").addEventListener("click", async ()=>{
  if (!canEdit()) return alert("صلاحياتك لا تسمح.");

const fixedCode = formatCodeInput($("fCode").value);
const autoSec = getSectionFromCode(fixedCode);
const dateVal = $("fDate").value.trim();
const payload = {
  section: autoSec,
  subgroup: $("fSubgroup").value.trim() || (SECTION_TITLES[autoSec] || ""),
  code: fixedCode,
  rank: $("fRank").value.trim(),
  name: $("fName").value.trim(),
  discord_id: $("fDiscord").value.trim(),
  notes: $("fNotes").value.trim(),
  reg_date:(/^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : "0000-00-00")
};
// ✅ Fix: القيادة ما كان لها رتبة تلقائية
if (!payload.rank && autoSec === "leadership") {
  payload.rank = "قيادة";
}


  const missing = [];
if (!payload.subgroup) missing.push("المجموعة");
if (!payload.code) missing.push("الكود");
if (!payload.rank) missing.push("المسمى الوظيفي");
if (!payload.name) missing.push(" اسم الموظف ");
if (!payload.discord_id) missing.push("ديسكورد ID");

if (missing.length) {
  console.log("PAYLOAD:", payload);
  return alert("ناقص: " + missing.join(" - "));
}

  if (state.editingId) {
    await api(`/personnel/${state.editingId}`, { method:"PUT", body: JSON.stringify(payload) });
  } else {
    await api(`/personnel`, { method:"POST", body: JSON.stringify(payload) });
  }

  closeRowModal();
  await loadRows();
});

/* ---------- Search ---------- */
$("searchBtn").addEventListener("click", async ()=>{
  state.q = $("searchInput").value.trim();
  await loadRows();
});
$("searchInput").addEventListener("keydown", async (e)=>{
  if (e.key === "Enter") {
    state.q = $("searchInput").value.trim();
    await loadRows();
  }
});

/* ---------- Login ---------- */
function openLogin(){ $("loginModal").classList.remove("hidden"); }
function closeLogin(){ $("loginModal").classList.add("hidden"); }

$("loginBtn").addEventListener("click", openLogin);
$("closeLogin").addEventListener("click", closeLogin);
$("cancelLoginBtn").addEventListener("click", closeLogin);

$("doLoginBtn").addEventListener("click", async ()=>{
  try {
    const username = $("lUser").value.trim();
    const password = $("lPass").value;
    const data = await fetch(`${API}/auth/login`, {
      method:"POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ username, password })
    }).then(r => r.json().then(j => ({ ok:r.ok, j })));

    if (!data.ok) return alert(data.j.error || "Login failed");

    state.token = data.j.token;
    state.user = data.j.user;
    localStorage.setItem("token", state.token);
    localStorage.setItem("user", JSON.stringify(state.user));

    closeLogin();
    setActiveTab("employees");
    await loadRows();
  } catch (e) {
    alert(e.message || "Error");
  }
});

$("logoutBtn").addEventListener("click", async ()=>{
  state.token = "";
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  render();
});

/* ---------- Admin panel ---------- */
async function loadUsers(){
  if (state.user?.role !== "admin") return;
  const data = await api("/users");
  const wrap = $("usersTable");

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Username</th><th>Role</th><th>تعديل</th>
        </tr>
      </thead>
      <tbody>
        ${(data.users || []).map(u => `
          <tr>
            <td>${u.id}</td>
            <td><b>${escapeHtml(u.username)}</b></td>
            <td>${escapeHtml(u.role)}</td>
            <td>
              <select class="cellInput" data-role="${u.id}">
                <option ${u.role==="viewer"?"selected":""} value="viewer">viewer</option>
                <option ${u.role==="editor"?"selected":""} value="editor">editor</option>
                <option ${u.role==="admin"?"selected":""} value="admin">admin</option>
              </select>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll("[data-role]").forEach(sel=>{
    sel.addEventListener("change", async ()=>{
      const id = Number(sel.dataset.role);
      await api(`/users/${id}/role`, { method:"PUT", body: JSON.stringify({ role: sel.value }) });
    });
  });
}

$("createUserBtn").addEventListener("click", async ()=>{
  try{
    if (state.user?.role !== "admin") return alert("Admins فقط.");
    const username = $("newUser").value.trim();
    const password = $("newPass").value.trim();
    const role = $("newRole").value;

    if (!username || !password) return alert("اكتب username و password");

    await api("/users", { method:"POST", body: JSON.stringify({ username, password, role }) });
    $("newUser").value = "";
    $("newPass").value = "";
    await loadUsers();
    alert("تم إنشاء المستخدم ✅");
  }catch(e){
    alert(e.message);
  }
});

/* ---------- Buttons that exist in your UI (placeholder actions) ---------- */
$("homeBtn").addEventListener("click", ()=> window.scrollTo({ top:0, behavior:"smooth" }));
$("switchBtn").addEventListener("click", async ()=>{
  if (!state.user) return alert("سجّل دخول أولاً");
  if (state.user.role !== "admin") return alert("هذه لوحة الإدارة للإدمن فقط");

  $("adminPanel").classList.toggle("hidden");
  if (!$("adminPanel").classList.contains("hidden")) {
    await loadUsers();
    window.scrollTo({ top: $("adminPanel").offsetTop - 10, behavior:"smooth" });
  }
});

$("tabEmployees").addEventListener("click", ()=> setActiveTab("employees"));
$("tabCourses").addEventListener("click", ()=> setActiveTab("courses"));
$("tabVacations").addEventListener("click", ()=> setActiveTab("vacations"));
$("tabAbsence").addEventListener("click", ()=> setActiveTab("absence"));
$("adminToggleBtn").addEventListener("click", async ()=>{
  if (!state.user) return alert("سجّل دخول أولاً");
  if (state.user.role !== "admin") return alert("هذه لوحة الإدارة للإدمن فقط");
  setActiveTab("admin");
  await loadUsers();
});



$("saveAdjustBtn").addEventListener("click", async ()=>{
  if (!canEdit()) return alert("صلاحياتك لا تسمح.");

  const discord_id = $("adjDiscord").value.trim();
  const amount = Number($("adjAmount").value);
  const type = $("adjType").value;
const op = $("adjOperation")?.value || "add";

  if (!discord_id) return alert("اكتب ديسكورد ID");
  if (!Number.isFinite(amount) || amount === 0) return alert("اكتب كمية صحيحة");

const signedAmount = (op === "remove") ? -Math.abs(amount) : Math.abs(amount);

const body = {
  discord_id,
  addPoints: type === "points" ? signedAmount : 0,
  addHours:  type === "hours"  ? signedAmount : 0,
};

  await api("/personnel/adjust", { method:"POST", body: JSON.stringify(body) });
  closeAdjust();
  await loadRows();
});

/* ---------- Boot ---------- */
async function boot(){
  setAuthUI();
  setActiveTab("employees");

  if (!state.token) {
    $("content").innerHTML = `
      <div class="panel">
        <div class="panelHeader">
          <h2>الرجاء تسجيل الدخول</h2>
          <p class="muted">لإظهار البيانات وتحميلها.</p>
        </div>
      </div>`;
    return;
  }

  await loadRows();
  $("adminPanel").classList.add("hidden");
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("DOM READY ✅");
  boot();
  // ===== Add Row (+ إضافة سجل) =====
const addTopBtn = document.getElementById("addTopBtn");
console.log("addTopBtn:", addTopBtn);

addTopBtn?.addEventListener("click", () => {
  console.log("TOP ADD CLICK ✅");

  if (!state.token) return alert("سجّل دخول أولاً");
  if (!canEdit()) return alert("صلاحياتك لا تسمح.");

  openRowModal({
    section: "leadership",
    subgroup: ""
  });
});

  // ===== DEBUG: make sure buttons exist =====
  console.log("saveAdjustBtn:", $("saveAdjustBtn"));
  console.log("adjustModal:", $("adjustModal"));

  // ===== Close adjust modal =====
  $("closeAdjust")?.addEventListener("click", () => $("adjustModal").classList.add("hidden"));
  $("cancelAdjustBtn")?.addEventListener("click", () => $("adjustModal").classList.add("hidden"));

  // ===== Save points/hours (حفظ) =====
  $("saveAdjustBtn")?.addEventListener("click", async () => {
    console.log("SAVE ADJUST CLICK ✅");

    if (!canEdit()) return alert("صلاحياتك لا تسمح.");

    const discord_id = $("adjDiscord").value.trim();
    const amount = Number($("adjAmount").value);
    const type = $("adjType").value;

    if (!discord_id) return alert("اكتب ديسكورد ID");
    if (!Number.isFinite(amount) || amount === 0) return alert("اكتب كمية صحيحة");

    const body = {
      discord_id,
      addPoints: type === "points" ? amount : 0,
      addHours:  type === "hours"  ? amount : 0,
    };

    try {
      const res = await api("/personnel/adjust", { method:"POST", body: JSON.stringify(body) });
      console.log("adjust response:", res);
      $("adjustModal").classList.add("hidden");
      await loadRows();
      alert("تم التحديث ✅");
    } catch (e) {
      console.error("ADJUST ERROR:", e);
      alert(e.message || "خطأ أثناء الحفظ");
    }
  });
$("resetAdjustBtn")?.addEventListener("click", async () => {
  if (!canEdit()) return alert("صلاحياتك لا تسمح.");

  const discord_id = $("adjDiscord").value.trim();
  if (!discord_id) return alert("اكتب ديسكورد ID");

  if (!confirm("تأكيد تصفير النقاط والساعات؟")) return;

  try {
    await api("/personnel/reset", { method: "POST", body: JSON.stringify({ discord_id }) });
    $("adjustModal").classList.add("hidden");
    await loadRows();
    alert("تم التصفير ✅");
  } catch (e) {
    alert(e.message || "Reset failed");
  }
});

   // ===== زر النقاط / الساعات =====
  const adjustBtn = $("adjustBtn");
  console.log("adjustBtn:", adjustBtn);

  if (adjustBtn) {
    adjustBtn.addEventListener("click", () => {
      console.log("ADJUST CLICK ✅");

      if (!canEdit()) {
        alert("صلاحياتك لا تسمح.");
        return;
      }

      $("adjDiscord").value = "";
      $("adjAmount").value = "";
      $("adjType").value = "points";

      $("adjustModal").classList.remove("hidden");
    });
  }
});


