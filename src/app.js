import { state, users, LEVEL_RANK, SERVICES, save, flush, initialize, onRefresh, startSync } from './store.js';
import { setHTML, bindActions, escapeHTML } from './ui.js';
const SERVICE_RULES = {"會前禱告":"worshipLeader","破冰":"growth","敬拜":"leader","音控":"growth","見證":"disciple","話語":"core","異象報告":"groupLeader"};
const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginUser = document.getElementById('loginUser');
const groupSelect = document.getElementById('groupSelect');
const currentUserLabel = document.getElementById('currentUserLabel');
const sideNav = document.getElementById('sideNav');
const mobileNav = document.getElementById('mobileNav');
const dashboard = document.getElementById('dashboard');
const home = document.getElementById('home');
const survey = document.getElementById('survey');
const schedule = document.getElementById('schedule');
const prayer = document.getElementById('prayer');
const substitute = document.getElementById('substitute');
const special = document.getElementById('special');
const guide = document.getElementById('guide');
const profile = document.getElementById('profile');
const admin = document.getElementById('admin');
function userByName(n) {return users.find(u => u.name === n)}
        function g() {return state.groups[state.currentGroup]}
        function access() {return g().access[state.currentUser] || null}
        function isManage() {return access() === "manage"}
        function isView() {return access() === "view"}
        function titleText(u) {return u.titles.join("／")}
        function lineName(n) {return userByName(n)?.lineName || n}
        function isGroupLeaderName(n) {return userByName(n)?.titles.includes("小組長")}
        function qualifies(n, s) {
            const u = userByName(n); if (!u) return false;
            const r = SERVICE_RULES[s];
            if (r === "groupLeader") return isGroupLeaderName(n);
            if (r === "worshipLeader") return (LEVEL_RANK[u.level] || 0) >= 3 || u.core || isGroupLeaderName(n);
            if (r === "growth") return (LEVEL_RANK[u.level] || 0) >= 1 || u.core || isGroupLeaderName(n);
            if (r === "disciple") return (LEVEL_RANK[u.level] || 0) >= 2 || u.core || isGroupLeaderName(n);
            if (r === "leader") return (LEVEL_RANK[u.level] || 0) >= 3 || u.core || isGroupLeaderName(n);
            if (r === "core") return u.core || isGroupLeaderName(n);
            return true;
        }
        function availableGroupsForUser(name) {return Object.values(state.groups).filter(gr => gr.access[name])}

        function buildCycleLabel(year, month, duration) {
            const endIndex = (year * 12 + (month - 1)) + (duration - 1);
            const endYear = Math.floor(endIndex / 12);
            const endMonth = (endIndex % 12) + 1;
            if (year === endYear) return `${year} ${month}–${endMonth} 月`;
            return `${year} ${month} 月–${endYear} ${endMonth} 月`;
        }
        function updateCycleLabelFromSettings() {
            const c = state.cycles[g().id];
            c.next = buildCycleLabel(Number(c.nextStartYear), Number(c.nextStartMonth), Number(c.durationMonths));
            save();
        }
        function fmtDate(dt) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, "0");
            const d = String(dt.getDate()).padStart(2, "0");
            return `${y}/${m}/${d}`;
        }
        function calc321Dates() {
            const c = state.cycles[g().id];
            const start = new Date(Number(c.nextStartYear), Number(c.nextStartMonth) - 1, 1);
            const open = new Date(start); open.setDate(open.getDate() - 21);
            const deadline = new Date(start); deadline.setDate(deadline.getDate() - 14);
            const publish = new Date(start); publish.setDate(publish.getDate() - 7);
            c.surveyOpen = fmtDate(open);
            c.surveyDeadline = fmtDate(deadline);
            c.publishDeadline = fmtDate(publish);
            save();
        }

        function generateCycleDates() {
            const gr = g(), c = state.cycles[gr.id];
            const weekdayMap = {"週一": 1, "週二": 2, "週三": 3, "週四": 4, "週五": 5, "週六": 6, "週日": 0};
            const target = weekdayMap[gr.meetingDay] ?? 1;
            const dates = [];
            let y = Number(c.nextStartYear), m = Number(c.nextStartMonth);
            for (let k = 0; k < Number(c.durationMonths); k++) {
                const idx = (y * 12 + (m - 1)) + k;
                const yy = Math.floor(idx / 12), mm = (idx % 12) + 1;
                const dt = new Date(yy, mm - 1, 1);
                while (dt.getMonth() === mm - 1) {
                    if (dt.getDay() === target) dates.push(`${mm}/${dt.getDate()}`);
                    dt.setDate(dt.getDate() + 1);
                }
            }
            c.nextDates = dates;
            c.pausedDates = (c.pausedDates || []).filter(d => dates.includes(d));
            calc321Dates();
            save();
        }
        function navItems() {
            let a = [["dashboard", "總覽"], ["home", "小組首頁"], ["survey", "本期調查"], ["schedule", "服事表"], ["prayer", "禱告"], ["substitute", "請假／代班"], ["special", "其他調查"], ["guide", "小組流程"], ["profile", "我的資料"]];
            if (isManage()) a.push(["admin", "管理中心"]);
            return a;
        }
        function activePage() {return [...document.querySelectorAll(".page")].find(p => p.classList.contains("active"))?.id || "dashboard"}
        function showPage(id) {document.querySelectorAll(".page").forEach(p => p.classList.remove("active")); document.getElementById(id).classList.add("active"); renderAll(); window.scrollTo({top: 0, behavior: "smooth"})}
        function renderNav() {
            const act = activePage();
            setHTML(sideNav, navItems().map(([id, t]) => `<button class="navbtn ${id === act ? "active" : ""}" data-click="showPage('${id}')">${t}</button>`).join(""));
            setHTML(mobileNav, navItems().map(([id, t]) => `<button class="${id === act ? "active" : ""}" data-click="showPage('${id}')">${t}</button>`).join(""));
        }
        function login() {
            state.currentUser = loginUser.value;
            const groups = availableGroupsForUser(state.currentUser);
            state.currentGroup = groups[0]?.id || "monday"; save();
            loginScreen.classList.add("hidden"); appScreen.classList.remove("hidden");
            showPage(groups.length > 1 ? "dashboard" : "home");
        }
        function logout() {state.currentUser = null; save(); setHTML(mobileNav, ''); appScreen.classList.add("hidden"); loginScreen.classList.remove("hidden")}
        function scheduleBadge(grId = state.currentGroup) {return state.scheduleStatus[grId] === "published" ? `<span class="badge ok">已發布</span>` : `<span class="badge warn">草稿</span>`}
        function renderSelectors() {
            currentUserLabel.textContent = state.currentUser || "";
            const groups = availableGroupsForUser(state.currentUser);
            setHTML(groupSelect, groups.map(gr => `<option value="${gr.id}" ${gr.id === state.currentGroup ? "selected" : ""}>${gr.name}</option>`).join(""));
        }
        function renderDashboard() {
            const gs = availableGroupsForUser(state.currentUser);
            setHTML(dashboard, `<h1>我的小組</h1><div class="sub">${state.currentUser} 可存取 ${gs.length} 個小組空間。</div>
 <div class="grid g3">${gs.map(gr => {
                const acc = gr.access[state.currentUser], leaves = state.leaveRequests[gr.id].filter(x => x.status === "open").length;
                return `<div class="group-card"><div class="spread"><div class="title">${gr.name}</div>${scheduleBadge(gr.id)}</div>
    <div class="small muted" style="margin:8px 0">你的權限：${acc === "manage" ? "小組管理" : acc === "view" ? "區長檢視" : "組員"}</div>
    <div class="small">小組長：${gr.leader}</div><div class="small">聚會：${gr.meetingDay} ${gr.start}｜${gr.room}</div>
    <div class="small" style="margin-top:6px">目前待補位：${leaves}</div>
    <button class="btn ${acc === "manage" ? "primary" : ""}" style="margin-top:10px" data-click="enterGroup('${gr.id}')">${acc === "view" ? "查看小組" : "進入小組"}</button>
   </div>`}).join("")}</div>`);
        }
        function enterGroup(id) {state.currentGroup = id; save(); showPage("home")}
        function myAssignments() {
            let arr = []; Object.entries(g().assignments).forEach(([d, a]) => Object.entries(a).forEach(([s, n]) => {if (n === state.currentUser) arr.push({date: d, service: s})})); return arr;
        }
        function renderHome() {
            const gr = g(), u = userByName(state.currentUser), next = myAssignments()[0], leaves = state.leaveRequests[gr.id].filter(x => x.status === "open");
            const notes = (state.notifications[gr.id] || []).filter(n => n.active);
            setHTML(home, `<div class="spread"><div><h1>${gr.name}</h1><div class="sub">${gr.meetingDay} ${gr.start}｜${gr.room}</div></div>${scheduleBadge()}</div>
 <div class="grid g3">
  <div class="card hero"><div class="muted">我的下一次服事</div><div class="kpi">${next ? next.date : "—"}</div><div style="font-size:20px;margin-top:5px">${next ? next.service : "目前沒有安排"}</div></div>
  <div class="card"><div class="muted">目前權限</div><div style="font-size:20px;font-weight:800;margin-top:7px">${isManage() ? "小組管理" : isView() ? "區長檢視" : "組員"}</div><div class="small muted">${titleText(u)}</div></div>
  <div class="card"><div class="muted">待補位</div><div class="kpi">${leaves.length}</div><div class="small muted">臨時請假／代班</div></div>
 </div>

 <div class="card" style="margin-top:14px;border:2px solid #d9d3ff;background:#fbfaff">
  <div class="spread"><h2>最新通知</h2><span class="badge brand">${notes.length} 則</span></div>
  <div class="list">${notes.length ? notes.map(n => `<div class="item ${n.type === "cycle" ? "soft" : ""}"><div class="spread"><div><b>${n.title}</b><div class="small muted">${n.message}</div><div class="small muted">截止：${n.deadline}</div></div><button class="btn primary" data-click="showPage('${n.target}')">${n.type === "cycle" ? "前往填寫" : "查看調查"}</button></div></div>`).join("") : `<div class="muted">目前沒有新的調查通知。</div>`}</div>
 </div>

 <div class="grid g2" style="margin-top:14px">
  <div class="card"><h2>小組設定</h2><div class="list">
   <div class="item"><b>會前禱告</b><div class="small muted">${gr.prePrayer}</div></div>
   <div class="item"><b>小組長</b><div class="small muted">${gr.leader}</div></div>
  </div></div>
  <div class="card"><h2>快速入口</h2><div class="list">
   <button class="btn" data-click="showPage('schedule')">查看／複製最新版服事表</button>
   <button class="btn" data-click="showPage('survey')">填寫下一期服事＋禱告調查</button>
   <button class="btn" data-click="showPage('special')">查看其他調查</button>
   <button class="btn" data-click="showPage('guide')">查看小組流程</button>
   ${isManage() ? `<button class="btn primary" data-click="showPage('admin')">進入管理中心</button>` : ""}
  </div></div>
 </div>`);
        }
        function renderSurvey() {
            const gr = g(), cycle = state.cycles[gr.id];
            const ps = (state.prayerSurvey[gr.id] || {})[state.currentUser] || {mode: "", days: [], slots: [], all: false, pass: false, note: ""};
            const weekdays = ["週一", "週二", "週三", "週四", "週五"];
            const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "12:00", "12:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];
            const surveyDates = (cycle.nextDates || []).filter(d => !(cycle.pausedDates || []).includes(d));
            setHTML(survey, `<h1>${cycle.next}｜服事＋禱告調查</h1>
 <div class="sub">本次調查的是 <b>${cycle.next}</b> 的小組服事時間與 RPG／晨禱安排。調查截止：${cycle.surveyDeadline}。已設定的小組暫停日不會列入調查。</div>

 <div class="card">
  <div class="spread"><h2>① ${cycle.next} 小組服事時間</h2><span class="badge brand">下一期</span></div>
  <div class="notice">請標記下一期哪些聚會日期可以／無法服事。此版先儲存調查回覆，供小組長安排；自動排班功能尚未開放。</div>
  <div class="list" style="margin-top:12px">${surveyDates.map(d => `<div class="item"><div class="spread"><div><b>${d}</b><div class="small muted">${gr.meetingDay}小組</div></div><select aria-label="${d} 服事意願" style="width:140px" data-change="setAvailability('${d}',this.value)"><option value="">尚未填寫</option><option value="yes" ${ps.availability?.[d] === 'yes' ? 'selected' : ''}>可以</option><option value="no" ${ps.availability?.[d] === 'no' ? 'selected' : ''}>無法</option></select></div></div>`).join("")}</div>
 </div>

 <div class="card" style="margin-top:14px">
  <div class="spread"><h2>② ${cycle.next} RPG／晨禱安排</h2><span class="badge brand">一起調查</span></div>
  <div class="notice">固定以 30 分鐘為一個時段。可以多選星期與時段，填得越多越容易找到 2–3 人共同時間。</div>

  <div class="field" style="margin-top:12px"><label>本期選擇</label>
   <div class="checks">
    ${["RPG", "晨禱"].map(m => `<label class="check"><input type="radio" name="pmode" ${ps.mode === m ? "checked" : ""} data-change="setPrayerMode('${m}')"> ${m}</label>`).join("")}
    <label class="check"><input type="checkbox" ${ps.all ? "checked" : ""} data-change="setPrayerAll(this.checked)"> 皆可</label>
    <label class="check"><input type="checkbox" ${ps.pass ? "checked" : ""} data-change="setPrayerPass(this.checked)"> Pass</label>
   </div>
  </div>

  <div class="field" style="margin-top:12px"><label>可配合星期（可複選）</label>
   <div class="checks">${weekdays.map(d => `<label class="check"><input type="checkbox" ${ps.days.includes(d) ? "checked" : ""} data-change="togglePrayerDay('${d}',this.checked)"> ${d}</label>`).join("")}</div>
  </div>

  <div class="field" style="margin-top:12px"><label>可配合時間（30 分鐘一格，可複選）</label>
   <div class="checks">${slots.map(t => `<label class="check"><input type="checkbox" ${ps.slots.includes(t) ? "checked" : ""} data-change="togglePrayerSlot('${t}',this.checked)"> ${t}</label>`).join("")}</div>
  </div>

  <div class="field" style="margin-top:12px"><label>補充說明</label><input id="prayerNote" value="${escapeHTML(ps.note)}" placeholder="例如：平日晚上 9:30 後都可以" data-change="setPrayerNote(this.value)"></div>
  <div class="right" style="margin-top:12px"><button class="btn primary" data-click="savePrayerSurvey()">儲存 ${cycle.next} 調查</button></div>
 </div>`);
        }
        function ensurePrayerResponse() {
            state.prayerSurvey[g().id] = state.prayerSurvey[g().id] || {};
            state.prayerSurvey[g().id][state.currentUser] = state.prayerSurvey[g().id][state.currentUser] || {mode: "", days: [], slots: [], all: false, pass: false, note: ""};
            return state.prayerSurvey[g().id][state.currentUser];
        }
        function setPrayerMode(v) {const p = ensurePrayerResponse(); p.mode = v; p.pass = false; save(); renderSurvey()}
        function setPrayerAll(v) {const p = ensurePrayerResponse(); p.all = v; if (v) {p.days = ["週一", "週二", "週三", "週四", "週五"]} save(); renderSurvey()}
        function setPrayerPass(v) {const p = ensurePrayerResponse(); p.pass = v; if (v) {p.mode = ""; p.days = []; p.slots = []; p.all = false} save(); renderSurvey()}
        function togglePrayerDay(d, on) {const p = ensurePrayerResponse(); if (on && !p.days.includes(d)) p.days.push(d); if (!on) p.days = p.days.filter(x => x !== d); save()}
        function togglePrayerSlot(t, on) {const p = ensurePrayerResponse(); if (on && !p.slots.includes(t)) p.slots.push(t); if (!on) p.slots = p.slots.filter(x => x !== t); save()}
        function setPrayerNote(v) {const p = ensurePrayerResponse(); p.note = v; save()}
        function setAvailability(date, value) {const p = ensurePrayerResponse(); (p.availability ||= {})[date] = value; save()}
        async function savePrayerSurvey() {save(); await flush(); alert("本期服事＋禱告調查已儲存")}
        function lineAnnouncement(date) {
            const gr = g(), a = gr.assignments[date] || {}, dateObj = gr.dates.find(x => x.d === date);
            const communionText = dateObj?.communion ? gr.communionReminder + "\n\n" : "";
            const template = state.lineTemplates[gr.id] || "";
            return template
                .replaceAll("{ROOM}", gr.room)
                .replaceAll("{PRAYER}", lineName(a["會前禱告"] || a["敬拜"] || gr.leader))
                .replaceAll("{PREPRAYER}", gr.prePrayer)
                .replaceAll("{COMMUNION}", communionText)
                .replaceAll("{ICE}", lineName(a["破冰"] || "待安排"))
                .replaceAll("{WORSHIP}", lineName(a["敬拜"] || "待安排"))
                .replaceAll("{AUDIO}", lineName(a["音控"] || "待安排"))
                .replaceAll("{TESTIMONY}", lineName(a["見證"] || "待安排"))
                .replaceAll("{WORD}", lineName(a["話語"] || "待安排"));
        }
        function renderSchedule() {
            const gr = g(), dates = gr.dates.filter(x => !x.off);
            setHTML(schedule, `<div class="spread"><div><h1>本期服事表</h1><div class="sub">前一天負責同工可直接複製最新版貼到 LINE。</div></div>${scheduleBadge()}</div>
 <div class="card"><div class="row"><select id="copyDate">${dates.map(x => `<option>${x.d}</option>`).join("")}</select><button class="btn primary" data-click="copyAnnouncement()">複製本週 LINE 公告</button></div></div>
 <div class="card" style="margin-top:14px;overflow:auto"><table><thead><tr><th>日期</th>${SERVICES.map(s => `<th>${s}</th>`).join("")}</tr></thead><tbody>${dates.map(x => `<tr><td><b>${x.d}</b>${x.communion ? `<div class="badge brand" style="margin-top:5px">領聖餐</div>` : ""}</td>${SERVICES.map(s => `<td>${gr.assignments[x.d]?.[s] || "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
 <div class="card" style="margin-top:14px">
  <div class="spread"><h2>LINE 公告預覽</h2><div class="row">${isManage() ? `<button class="btn" data-click="saveLineTemplate()">儲存為本小組公版</button>` : ""}<button class="btn" data-click="refreshPreview()">重新帶入最新版</button></div></div>
  <textarea id="previewText" rows="16">${escapeHTML(dates.length ? lineAnnouncement(dates[0].d) : '尚無聚會日期')}</textarea>
  <div class="small muted" style="margin-top:8px">可直接修改文字後複製；若你是小組長，也可把目前內容儲存為本小組之後沿用的公版。</div>
 </div>`);
            document.getElementById("copyDate")?.addEventListener("change", refreshPreview);
        }
        function refreshPreview() {const d = document.getElementById("copyDate").value; document.getElementById("previewText").value = lineAnnouncement(d)}
        function copyAnnouncement() {const txt = document.getElementById("previewText").value; navigator.clipboard.writeText(txt).then(() => alert("已複製目前 LINE 公告內容"))}
        async function saveLineTemplate() {
            if (!isManage()) return;
            const txt = document.getElementById("previewText").value;
            const d = document.getElementById("copyDate").value, gr = g(), a = gr.assignments[d] || {}, dateObj = gr.dates.find(x => x.d === d);
            let tpl = txt;
            const pairs = [
                [gr.room, "{ROOM}"],
                [lineName(a["會前禱告"] || a["敬拜"] || gr.leader), "{PRAYER}"],
                [gr.prePrayer, "{PREPRAYER}"],
                [lineName(a["破冰"] || "待安排"), "{ICE}"],
                [lineName(a["敬拜"] || "待安排"), "{WORSHIP}"],
                [lineName(a["音控"] || "待安排"), "{AUDIO}"],
                [lineName(a["見證"] || "待安排"), "{TESTIMONY}"],
                [lineName(a["話語"] || "待安排"), "{WORD}"]
            ];
            pairs.forEach(([val, key]) => {tpl = tpl.replaceAll(val, key)});
            if (dateObj?.communion) tpl = tpl.replace(gr.communionReminder + "\n\n", "{COMMUNION}");
            else if (!tpl.includes("{COMMUNION}")) tpl = tpl.replace("破冰：", "{COMMUNION}破冰：");
            state.lineTemplates[gr.id] = tpl; save(); await flush(); alert("已儲存為這個小組的 LINE 公版");
        }
        function renderPrayer() {
            const gr = g(), responses = state.prayerSurvey[gr.id] || {}, draft = state.prayerDraft[gr.id] || [], final = state.prayerFinal[gr.id] || [];
            setHTML(prayer, `<div class="spread"><div><h1>RPG／晨禱安排</h1><div class="sub">調查後由系統先配對，小組長確認後才定稿。</div></div>${final.length ? `<span class="badge ok">已定稿</span>` : `<span class="badge warn">安排中</span>`}</div>

 ${isManage() || isView() ? `<div class="card"><h2>本期調查摘要</h2><div style="overflow:auto"><table><thead><tr><th>組員</th><th>選擇</th><th>星期</th><th>時間</th><th>備註</th></tr></thead><tbody>${gr.members.map(n => {const p = responses[n] || {}; return `<tr><td>${n}</td><td>${p.pass ? "Pass" : (p.all ? "皆可" : (p.mode || "未填"))}</td><td>${(p.days || []).join("、") || "—"}</td><td>${(p.slots || []).join("、") || "—"}</td><td>${p.note || ""}</td></tr>`}).join("")}</tbody></table></div></div>` : ""}

 <div class="grid g2" style="margin-top:14px">
  <div class="card"><div class="spread"><h2>系統建議安排</h2>${isManage() ? `<button class="btn" data-click="generatePrayerDraft()">重新系統配對</button>` : ""}</div>
   <div class="list">${draft.map((x, i) => `<div class="item ${x.status === "needs_adjust" ? "warn" : ""}"><b>${x.type} ${i + 1}</b><div>${x.people.join("・")}</div><div class="small muted">${x.day} ${x.time}</div>${x.note ? `<div class="small muted">${x.note}</div>` : ""}</div>`).join("") || `<div class="muted">尚未產生系統建議。</div>`}
  </div>
  <div class="card"><div class="spread"><h2>正式安排</h2>${isManage() ? `<button class="btn ok" data-click="confirmPrayerFinal()">確認定稿</button>` : ""}</div>
   <div class="list">${final.map((x, i) => `<div class="item"><b>${x.type} ${i + 1}</b><div>${x.people.join("・")}</div><div class="small muted">${x.day} ${x.time}</div></div>`).join("") || `<div class="muted">尚未定稿。</div>`}</div>
  </div>
 </div>`);
        }
        function generatePrayerDraft() {
            const gr = g(), responses = state.prayerSurvey[gr.id] || {};
            const active = gr.members.filter(n => responses[n] && !responses[n].pass && (responses[n].mode || responses[n].all));
            const used = new Set(), draft = [];
            const weekdays = ["週一", "週二", "週三", "週四", "週五"];
            const slots = ["07:00", "07:30", "08:00", "08:30", "09:00", "12:00", "12:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"];

            function overlap(a, b, mode) {
                const pa = responses[a], pb = responses[b];
                const modeOK = pa.all || pb.all || pa.mode === mode || pb.mode === mode;
                if (!modeOK) return null;
                const days = (pa.days || weekdays).filter(d => (pb.days || weekdays).includes(d));
                const times = (pa.slots || []).filter(t => (pb.slots || []).includes(t));
                if (days.length && times.length) return {day: days[0], time: times[0]};
                return null;
            }

            for (const mode of ["晨禱", "RPG"]) {
                const pool = active.filter(n => !used.has(n) && (responses[n].all || responses[n].mode === mode));
                for (let i = 0; i < pool.length; i++) {
                    if (used.has(pool[i])) continue;
                    let group = [pool[i]], slot = null;
                    for (let j = i + 1; j < pool.length; j++) {
                        if (used.has(pool[j])) continue;
                        const ov = overlap(pool[i], pool[j], mode);
                        if (ov) {group.push(pool[j]); slot = ov}
                        if (group.length === 3) break;
                    }
                    if (group.length >= 2 && slot) {
                        group.forEach(n => used.add(n));
                        draft.push({type: mode, people: group, day: slot.day, time: slot.time, status: "matched"});
                    }
                }
            }

            active.filter(n => !used.has(n)).forEach(n => {
                const p = responses[n];
                draft.push({type: p.mode || "RPG/晨禱", people: [n], day: (p.days || [])[0] || "待確認", time: (p.slots || [])[0] || "待確認", status: "needs_adjust", note: "目前沒有找到 2–3 人完整交集，建議詢問是否可調整其他時段。"});
            });
            state.prayerDraft[gr.id] = draft; save(); renderAll(); alert("已依照星期、30 分鐘時段與 RPG／晨禱選擇產生建議配對。");
        }
        function confirmPrayerFinal() {
            if (!(state.prayerDraft[g().id] || []).length) {alert("請先產生系統建議安排"); return }
            state.prayerFinal[g().id] = JSON.parse(JSON.stringify(state.prayerDraft[g().id]));
            save(); renderAll(); alert("禱告安排已由小組長確認定稿。");
        }
        function renderSubstitute() {
            const gr = g(), arr = state.leaveRequests[gr.id], mine = myAssignments();
            setHTML(substitute, `<h1>請假／代班</h1><div class="sub">正式發布後仍可因臨時狀況更新。</div><div class="grid g2">
 <div class="card"><h2>我的服事</h2><div class="list">${mine.map(x => `<div class="item"><div class="spread"><b>${x.date}｜${x.service}</b><button class="btn danger" data-click="startLeave('${x.date}','${x.service}')">我要請假</button></div></div>`).join("") || `<div class="muted">目前沒有服事。</div>`}</div></div>
 <div class="card"><h2>目前缺人</h2><div class="list">${arr.filter(x => x.status === "open").map(r => `<div class="item bad"><b>${r.date}｜${r.service}</b><div class="small muted">${r.from}｜${r.reason}</div>${state.currentUser !== r.from && qualifies(state.currentUser, r.service) ? `<button class="btn ok" style="margin-top:8px" data-click="acceptSub(${r.id})">我可以代班</button>` : ""}</div>`).join("") || `<div class="muted">目前沒有缺人。</div>`}</div></div></div>`);
        }
        async function startLeave(date, service) {
            if (g().assignments[date]?.[service] !== state.currentUser) throw new Error('只能替自己的服事請假');
            if (state.leaveRequests[g().id].some(r => r.date === date && r.service === service && r.status === 'open')) throw new Error('這個班次已有待處理的請假');
            const reason = prompt('請填寫請假原因'); if (reason === null) return;
            state.leaveRequests[g().id].push({id: Date.now(), date, service, from: state.currentUser, reason: reason || '臨時有事', status: 'open', substitute: null});
            save(); await flush(); renderAll();
        }
        async function acceptSub(id) {
            const r = state.leaveRequests[g().id].find(x => x.id === id);
            if (!r || r.status !== 'open') throw new Error('此班次已被接下，請重新載入');
            if (!g().members.includes(state.currentUser) || r.from === state.currentUser || !qualifies(state.currentUser, r.service)) throw new Error('目前選擇的成員不符合代班資格');
            if (g().assignments[r.date]?.[r.service] !== r.from) throw new Error('原排班已變更，請由小組長確認');
            r.status = 'filled'; r.substitute = state.currentUser;
            g().assignments[r.date][r.service] = state.currentUser;
            state.changeLogs[g().id].push(`剛剛｜${r.date} ${r.service}：${r.from} → ${state.currentUser}（代班）`);
            save(); await flush(); renderAll(); alert('代班完成，正式服事表已更新');
        }
        function renderSpecial() {
            const arr = state.customSurveys[g().id];
            setHTML(special, `<div class="spread"><div><h1>其他調查</h1><div class="sub">各小組自行建立、設定截止日期並分享。</div></div>${isManage() ? `<button class="btn primary" data-click="newSurvey()">＋新增調查</button>` : ""}</div>
 <div class="notice">這一版可建立與儲存調查公告；自訂題目、填答與結果統計尚未開放。服事與禱告調查請使用「本期調查」。</div>
 <div class="grid g2">${arr.map(s => `<div class="card"><div class="spread"><h2>${escapeHTML(s.title)}</h2><span class="badge ${s.status === "open" ? "ok" : "warn"}">${s.status === "open" ? "公告中" : "草稿"}</span></div><div class="small muted">截止：${escapeHTML(s.deadline)}</div><div class="row" style="margin-top:10px"><button class="btn" disabled>自訂填答（尚未開放）</button>${isManage() ? `<button class="btn" data-click="copySurveyNotice(${s.id})">複製 LINE 提醒</button>` : ""}</div></div>`).join("") || `<div class="card muted">目前沒有其他調查。</div>`}</div>`);
        }
        async function newSurvey() {
            const title = prompt("調查名稱"); if (!title) return;
            const deadline = prompt("截止日期與時間，例如 10/25 22:00", "10/25 22:00");
            const id = Date.now(), grId = g().id;
            state.customSurveys[grId].push({id, title, deadline: deadline || "未設定", status: "open"});
            state.notifications[grId] = state.notifications[grId] || [];
            state.notifications[grId].unshift({id: id + 1, type: "custom", title, message: "請完成最新調查。", target: "special", deadline: deadline || "未設定", active: true});
            save(); await flush(); renderAll(); alert("調查公告已儲存，並已顯示在小組首頁最新通知。自訂填答尚未開放。");
        }
        function copySurveyNotice(id) {
            const s = state.customSurveys[g().id].find(x => x.id === id); const txt = `【${s.title}】
請大家記得上網填寫～
截止：${s.deadline}

請進入「${g().name}」→「其他調查」完成填寫。`; navigator.clipboard.writeText(txt).then(() => alert("已複製 LINE 提醒文字"))
        }
        function renderGuide() {
            setHTML(guide, `<h1>小組流程</h1><div class="sub">固定頁面，組員可隨時查閱。</div>
 <div class="flow">
 <div class="head">時間</div><div class="head">計時</div><div class="head">服事項目</div><div class="head">內容重點</div><div class="head">服事資格</div>
 <div>19:00–19:20</div><div>20 mins</div><div class="section">會前禱告</div><div>由敬拜同工帶領：開頭禱告、方言禱告、讚美禱告、為服事與小組禱告、權能服事領受、結束封存禱告。</div><div>由敬拜者帶領</div>
 <div>19:00–19:20</div><div>同時預備</div><div class="section">音控</div><div>預備敬拜歌曲、播放清單、主日精華版與音量設備；敬拜中留意主領需要，小組後關閉設備。</div><div>成長班以上（含正在上課）</div>
 <div>19:30–19:40</div><div>10 mins</div><div class="section">破冰</div><div>幫助新朋友放鬆、彼此熟悉；若能連結主日訊息更佳。</div><div>成長班以上（含正在上課）</div>
 <div>19:40–20:00</div><div>20 mins</div><div class="section">敬拜</div><div>快歌→讚美→慢歌→禱告安靜→權能服事→彼此禱告／靈的祝福。</div><div>領袖班結業以上</div>
 <div>20:00–20:10</div><div>10 mins</div><div class="section">見證</div><div>帶領者預備見證，可邀請 2–3 位分享；每位 3 分鐘內，最後做簡潔總結。</div><div>門徒班以上（含正在上課）</div>
 <div>20:10–20:20</div><div>10 mins</div><div class="section">話語</div><div>回顧主日訊息，抓重點、設計相關分享題目，最後帶出具體行動。</div><div>核心同工／小組長</div>
 <div>20:20–20:50</div><div>30 mins</div><div class="section">分享</div><div>依主題問題交流主日訊息的學習與看法。</div><div>依當週安排</div>
 <div>20:50–20:55</div><div>5 mins</div><div class="section">異象時間</div><div>挑望與報告家中大小事。</div><div>固定由小組長</div>
 <div>20:55–21:05</div><div>10 mins</div><div class="section">禱告</div><div>兩位至三位一組彼此代禱。</div><div>全體</div>
 <div>21:05–21:15</div><div>10 mins</div><div class="section">會後檢討</div><div>肯定做得好的地方、檢討可調整之處，最後做潔淨禱告。</div><div>小組長帶領</div>
 </div>`);
        }
        function renderProfile() {
            const u = userByName(state.currentUser);
            setHTML(profile, `<h1>我的資料</h1><div class="sub">同一個帳號可以在不同小組擁有不同系統權限。</div>
 <div class="grid g2"><div class="card"><h2>基本資料</h2><div class="item"><b>${u.name}</b><div class="small muted">LINE 顯示名稱：${u.lineName}</div><div class="small muted">教會職稱：${titleText(u)}</div><div class="small muted">培育進度：${u.level}</div></div></div>
 <div class="card"><h2>目前小組權限</h2><div class="item"><b>${g().name}</b><div class="small muted">${isManage() ? "小組管理" : isView() ? "區長檢視" : "組員"}</div></div></div></div>`);
        }
        function renderAdmin() {
            if (!isManage()) {setHTML(admin, ""); return }
            const gr = g();
            setHTML(admin, `<div class="spread"><div><h1>管理中心</h1><div class="sub">只有該小組的小組長能修改。</div></div>${scheduleBadge()}</div>
 <div class="grid g2">
  <div class="card"><h2>小組設定</h2>
   <div class="field"><label>教室</label><input value="${escapeHTML(gr.room)}" data-change="grUpdate('room',this.value)"></div>
   <div class="formgrid" style="margin-top:10px"><div class="field"><label>聚會時間</label><input value="${escapeHTML(gr.start)}" data-change="grUpdate('start',this.value)"></div><div class="field"><label>會前禱告</label><input value="${escapeHTML(gr.prePrayer)}" data-change="grUpdate('prePrayer',this.value)"></div></div>
   
  </div>
  <div class="card"><h2>聚會週設定</h2><div class="list">${gr.dates.filter(x => !x.off).map(x => `<div class="item"><div class="spread"><div><b>${x.d}</b><div class="small muted">${x.type}</div></div><label class="check"><input type="checkbox" ${x.communion ? "checked" : ""} data-change="toggleCommunion('${x.d}',this.checked)"> 本週領聖餐</label></div></div>`).join("")}</div></div>
 </div>
 <div class="card" style="margin-top:14px"><h2>本期排班調整</h2>${gr.dates.filter(date => !date.off).map(date => `<details><summary>${date.d}</summary><div class="formgrid">${SERVICES.map(s => {const eligible = gr.members.filter(n => qualifies(n, s)); const cur = gr.assignments[date.d]?.[s] || ""; return `<div class="field"><label>${s}</label><select aria-label="${date.d} ${s}" data-change="assign('${date.d}','${s}',this.value)"><option value="">未安排</option>${eligible.map(n => `<option value="${n}" ${n === cur ? "selected" : ""}>${n}</option>`).join("")}</select></div>`}).join("")}</div></details>`).join('')}</div>
 <div class="card" style="margin-top:14px"><h2>期別管理｜3-2-1 原則</h2>
  <div class="notice">3 週前開調查 → 2 週前截止 → 1 週前完成排班定稿發布。</div>
  <div class="grid g2" style="margin-top:12px">
   <div class="item"><b>目前期別</b><div class="small muted">${state.cycles[gr.id].current}</div></div>
   <div class="item"><b>下一期</b><div class="small muted">${state.cycles[gr.id].next}</div><div class="small muted">狀態：${state.cycles[gr.id].nextStatus}</div></div>
  </div>
  <div class="formgrid" style="margin-top:10px">
   <div class="field"><label>調查起始年度</label><select data-change="cycleSettingUpdate('nextStartYear',this.value)">${[2026, 2027, 2028, 2029].map(y => `<option value="${y}" ${Number(state.cycles[gr.id].nextStartYear) === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
   <div class="field"><label>調查起始月份</label><select data-change="cycleSettingUpdate('nextStartMonth',this.value)">${Array.from({length: 12}, (_, i) => i + 1).map(m => `<option value="${m}" ${Number(state.cycles[gr.id].nextStartMonth) === m ? "selected" : ""}>${m} 月</option>`).join("")}</select></div>
   <div class="field"><label>一次調查多久</label><select data-change="cycleSettingUpdate('durationMonths',this.value)"><option value="2" ${Number(state.cycles[gr.id].durationMonths) === 2 ? "selected" : ""}>2 個月</option><option value="3" ${Number(state.cycles[gr.id].durationMonths) === 3 ? "selected" : ""}>3 個月</option></select></div>
   <div class="field"><label>下一期期別</label><input value="${state.cycles[gr.id].next}" disabled></div>
   <div class="field"><label>開啟調查（自動：期別開始前 3 週）</label><input value="${state.cycles[gr.id].surveyOpen}" disabled></div>
   <div class="field"><label>調查截止（自動：期別開始前 2 週）</label><input value="${state.cycles[gr.id].surveyDeadline}" disabled></div>
   <div class="field"><label>最晚排班定稿（自動：期別開始前 1 週）</label><input value="${state.cycles[gr.id].publishDeadline}" disabled></div>
   <div class="field"><label>下一期聚會日期</label><input value="${(state.cycles[gr.id].nextDates || []).join('、')}" data-change="cycleDatesUpdate(this.value)" placeholder="例如：12/7、12/14、12/21、1/11"></div>
   <div class="field"><label>日期工具</label><button class="btn" data-click="generateCycleDates();renderAll()">依小組固定星期自動產生日期</button></div>
   <div class="field"><label>下一期操作</label><button class="btn primary" data-click="createNextCycle()">${state.cycles[gr.id].nextCreated ? "已建立下一期" : "建立下一期並沿用設定"}</button></div>
  </div>
  <div class="card" style="margin-top:12px;background:#fafafa">
   <h3>小組暫停日期</h3>
   <div class="small muted" style="margin-bottom:8px">請先勾選下一期哪些聚會日暫停。被勾選的日期不會出現在組員的服事調查，也不會進入系統排班。</div>
   <div class="checks">${(state.cycles[gr.id].nextDates || []).map(d => `<label class="check"><input type="checkbox" ${(state.cycles[gr.id].pausedDates || []).includes(d) ? "checked" : ""} data-change="togglePausedDate('${d}',this.checked)"> ${d} 暫停</label>`).join("") || `<span class="muted small">請先產生下一期聚會日期。</span>`}</div>
  </div>
  <div class="row" style="margin-top:10px">
   <button class="btn" data-click="openNextSurvey()">開啟下一期調查</button>
   <button class="btn" disabled title="後續版本加入排班演算法">自動排班（尚未開放）</button>
   <button class="btn" disabled title="後續版本加入下一期發布流程">下一期發布（尚未開放）</button>
  </div>
 </div>
 <p class="small muted">此為共用測試資料，儲存狀態顯示於頁面上方。</p>`);
        }
        function grUpdate(k, v) {g()[k] = v; save(); renderAll()}
        function toggleCommunion(d, v) {const x = g().dates.find(a => a.d === d); x.communion = v; save(); renderAll()}
        function assign(d, s, n) {if (!isManage()) throw new Error('請先選擇小組長'); if (n && (!g().members.includes(n) || !qualifies(n, s))) throw new Error('成員不符合服事資格'); if (state.leaveRequests[g().id].some(r => r.date === d && r.service === s && r.status === 'open')) throw new Error('此班次正在徵求代班，請先處理代班'); g().assignments[d] = g().assignments[d] || {}; g().assignments[d][s] = n; save()}
        function cycleUpdate(k, v) {state.cycles[g().id][k] = v; save()}
        function cycleSettingUpdate(k, v) {
            const c = state.cycles[g().id];
            if (Object.keys(state.prayerSurvey[g().id] || {}).length) {renderAll(); throw new Error('已有調查回覆的期別暫不支援變更起始月份或長度，以免回覆被移到另一期。');}
            c[k] = Number(v);
            updateCycleLabelFromSettings();
            generateCycleDates();
            calc321Dates();
            c.pausedDates = (c.pausedDates || []).filter(d => (c.nextDates || []).includes(d));
            save();
            renderAll();
        }
        function cycleDatesUpdate(v) {
            const c = state.cycles[g().id];
            c.nextDates = v.split(/[、,，]/).map(x => x.trim()).filter(Boolean);
            c.pausedDates = (c.pausedDates || []).filter(d => c.nextDates.includes(d));
            save();
            renderAll();
        }
        function togglePausedDate(d, on) {
            const c = state.cycles[g().id];
            c.pausedDates = c.pausedDates || [];
            if (on && !c.pausedDates.includes(d)) c.pausedDates.push(d);
            if (!on) c.pausedDates = c.pausedDates.filter(x => x !== d);
            save();
            renderAll();
        }
        function createNextCycle() {const c = state.cycles[g().id]; c.nextCreated = true; c.nextStatus = "已建立，待開放調查"; save(); renderAll(); alert("下一期已建立，沿用組員、資格、服事項目與小組設定。")}
        function openNextSurvey() {
            const grId = g().id, c = state.cycles[grId]; if (!c.nextCreated) {alert("請先建立下一期"); return }
            c.nextStatus = "調查開放中";
            const notes = state.notifications[grId] || [];
            let n = notes.find(x => x.type === "cycle");
            if (n) {n.title = `${c.next}｜服事＋禱告調查`; n.message = "請填寫下一期可服事日期與 RPG／晨禱可配合時間。"; n.deadline = c.surveyDeadline; n.active = true}
            else notes.push({id: Date.now(), type: "cycle", title: `${c.next}｜服事＋禱告調查`, message: "請填寫下一期可服事日期與 RPG／晨禱可配合時間。", target: "survey", deadline: c.surveyDeadline, active: true});
            state.notifications[grId] = notes; save(); renderAll(); alert("下一期「服事＋RPG／晨禱」調查已開放，並已顯示在小組首頁最新通知。");
        }
        function generateSuggestedSchedule() {throw new Error('自動排班尚未開放')}
        function finalizeSchedule() {throw new Error('下一期發布尚未開放')}
        function renderAll() {
            if (!state.currentUser) return;
            renderSelectors(); renderDashboard(); renderHome(); renderSurvey(); renderSchedule(); renderPrayer(); renderSubstitute(); renderSpecial(); renderGuide(); renderProfile(); renderAdmin(); renderNav();
        }
        
const actions = {userByName, g, access, isManage, isView, titleText, lineName, isGroupLeaderName, qualifies, availableGroupsForUser, buildCycleLabel, updateCycleLabelFromSettings, fmtDate, calc321Dates, generateCycleDates, navItems, activePage, showPage, renderNav, login, logout, scheduleBadge, renderSelectors, renderDashboard, enterGroup, myAssignments, renderHome, renderSurvey, ensurePrayerResponse, setPrayerMode, setPrayerAll, setPrayerPass, togglePrayerDay, togglePrayerSlot, setPrayerNote, savePrayerSurvey, lineAnnouncement, renderSchedule, refreshPreview, copyAnnouncement, saveLineTemplate, renderPrayer, generatePrayerDraft, confirmPrayerFinal, renderSubstitute, startLeave, acceptSub, renderSpecial, newSurvey, copySurveyNotice, renderGuide, renderProfile, renderAdmin, grUpdate, toggleCommunion, assign, cycleUpdate, cycleSettingUpdate, cycleDatesUpdate, togglePausedDate, createNextCycle, openNextSurvey, generateSuggestedSchedule, finalizeSchedule, renderAll};
function refreshUI() {
  setHTML(loginUser, users.map(u => '<option value="' + u.name + '">' + u.name + '｜' + titleText(u) + '</option>').join(''));
  loginScreen.classList.toggle('hidden', Boolean(state.currentUser));
  appScreen.classList.toggle('hidden', !state.currentUser);
  if (!state.currentUser) setHTML(mobileNav, '');
  renderAll();
}
actions.setAvailability = setAvailability;
bindActions(actions);
onRefresh(refreshUI);
groupSelect.addEventListener('change', event => { state.currentGroup = event.target.value; save(); showPage('home'); });
if (await initialize()) { refreshUI(); document.getElementById('loginButton').disabled = false; }
startSync();
