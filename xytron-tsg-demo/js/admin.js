/* ADMIN PAGE - login gate, tickets, statistics, knowledge base. */
import { login, logout, watchAuth } from "./auth.js";
import { dbList, dbAssign, dbResolve, dbAdmins, dbAddAdmin, dbEditAdmin, dbDelAdmin, dbPatch, dbDelTicket, dbFollowList, dbFollowHandle, esc, toast } from "./db.js";
const v = id => document.getElementById(id);

// ----- Edit these lists. Admin names are managed in the Admins tab -----
const DEFAULT_ADMINS = ["Fritz Vincent D. Estarez","Personel 1","Personel 2"]; // seeded once, then edit in the Admins tab
let admins = []; const names = () => admins.map(a => a.name);
const DEPTS = ["Printing","Sorting","Accounting","PST","MIS","Courier","Alchemy"];
const CATS = ["Hardware","Software","Network","Printer","Account Access","Others"];
const SEVS = ["Low","Medium","High","Critical"];

let all = [], removed = [], current = null;
const opts = (list, first) => `<option value="">${first}</option>` + list.map(x => `<option>${esc(x)}</option>`).join("");
v("fltSev").innerHTML = opts(SEVS, "All Severities"); v("fltDept").innerHTML = opts(DEPTS, "All Departments");
v("kbCat").innerHTML = opts(CATS, "All Categories");

const t0 = t => t.createdAt?.toMillis?.() ?? null, t1 = t => t.resolvedAt?.toMillis?.() ?? null;
const dur = ms => { const m = Math.round(ms/60000); if(m < 60) return m+"m"; const h = Math.floor(m/60); return h < 24 ? h+"h "+(m%60)+"m" : Math.floor(h/24)+"d "+(h%24)+"h"; };
const when = t => t1(t) ? new Date(t1(t)).toLocaleString() : "";

watchAuth(user => {
  const ok = !!user; me = user?.email || "";
  v("loginView").classList.toggle("hidden", ok); v("dash").classList.toggle("hidden", !ok); v("outBtn").classList.toggle("hidden", !ok);
  if(ok) load();
});
window.doLogin = async () => { const r = await login(v("lEmail").value.trim(), v("lPass").value); if(r !== true) toast(r); };
window.logout = logout;

async function load(){
  try{ const raw = await dbList(); removed = raw.filter(t => t.status === "Removed"); all = raw.filter(t => t.status !== "Removed"); }
  catch(e){ console.error(e); toast("Not authorized to view tickets"); logout(); return; }
  await loadAdmins(); await loadFollows(); renderTickets(); renderStats(); renderKb(); renderAdmins(); renderReport(); renderRemoved(); renderFollows();
}

// ----- Tickets tab -----
function renderTickets(){
  const q = v("q").value.toLowerCase(), sev = v("fltSev").value, dept = v("fltDept").value;
  const list = all.filter(t => (!sev||t.severity===sev) && (!dept||t.department===dept) && (t.name+t.details+t.category+refOf(t)).toLowerCase().includes(q));
  v("rows").innerHTML = list.map(t => {
    const done = t.status === "Resolved";
    const assign = done ? esc(t.resolvedBy || t.assignedTo || "") :
      `<select data-assign="${esc(t.id)}"><option value="">Unassigned</option>${names().map(a => `<option ${t.assignedTo===a?"selected":""}>${esc(a)}</option>`).join("")}</select>`;
    const act = done ? '<span class="tag ok">Resolved</span>' : `<button class="btn dark" data-resolve="${esc(t.id)}">Resolve</button>`;
    const fu = pendingFor(t).length;
    return `<tr class="${fu ? "fu" : ""}"><td>${esc(t.name)}<small class="ref">${refOf(t)}</small>${fu ? `<span class="fbadge">Follow-up x${fu}</span>` : ""}</td><td>${esc(t.department)}</td><td>${esc(t.category)}</td><td><span class="tag">${esc(t.severity)}</span></td>
      <td>${esc(t.details)}</td><td>${esc(t.at)}</td><td>${assign}</td><td>${act} <button class="btn dark" data-remove="${esc(t.id)}">Remove</button></td></tr>`;
  }).join("");
  const n = s => all.filter(t => t.status === s).length;
  v("sTotal").textContent = all.length; v("sOpen").textContent = n("Unresolved"); v("sProg").textContent = n("In Progress"); v("sDone").textContent = n("Resolved");
}
["q","fltSev","fltDept"].forEach(id => v(id).addEventListener("input", renderTickets));

v("rows").addEventListener("change", async e => {
  const id = e.target.dataset.assign; if(id === undefined) return;
  try{ await dbAssign(id, e.target.value); await load(); toast(e.target.value ? "Assigned to " + e.target.value : "Unassigned"); }
  catch(err){ console.error(err); toast("Could not assign: " + (err.code || err.message)); }
});
v("rows").addEventListener("click", e => {
  const id = e.target.dataset.resolve; if(!id) return;
  current = all.find(t => t.id === id);
  v("mInfo").textContent = `${current.category} - ${current.department} - ${current.name}: ${current.details}`;
  v("mWho").value = current.assignedTo || ""; v("mCause").value = ""; v("mSteps").value = "";
  v("modal").classList.remove("hidden");
});
v("mCancel").onclick = () => v("modal").classList.add("hidden");
v("mSave").onclick = async () => {
  if(!current) return;
  const info = { resolvedBy: v("mWho").value, rootCause: v("mCause").value.trim(), steps: v("mSteps").value.trim() };
  if(!info.resolvedBy || info.rootCause.length < 3 || info.steps.length < 10){ toast("Select who resolved it and document the root cause and steps"); return; }
  try{ await dbResolve(current.id, info); v("modal").classList.add("hidden"); await load(); toast("Ticket resolved and documented"); }
  catch(err){ console.error(err); toast("Could not save: " + (err.code || err.message)); }
};

// ----- Statistics tab -----
const tally = (list, f) => list.reduce((o,t) => { const k = f(t); if(k) o[k] = (o[k]||0) + 1; return o; }, {});
const bars = (title, counts) => {
  const e = Object.entries(counts).sort((a,b) => b[1]-a[1]), m = Math.max(1, ...e.map(x => x[1]));
  return `<div class="card"><h2>${title}</h2>${e.length ? e.map(([k,n]) => `<div class="hb"><span>${esc(k)}</span><i style="width:${n/m*100}%"></i><b>${n}</b></div>`).join("") : '<p class="muted">No data yet</p>'}</div>`;
};
function renderStats(){
  const res = all.filter(t => t.status === "Resolved"), times = res.filter(t => t0(t) && t1(t)).map(t => t1(t) - t0(t));
  const avg = times.length ? dur(times.reduce((a,b) => a+b, 0) / times.length) : "-";
  const rate = all.length ? Math.round(res.length / all.length * 100) + "%" : "-";
  const top = Object.entries(tally(all, t => t.category)).sort((a,b) => b[1]-a[1])[0];
  const kpi = (l, val) => `<div class="stat kpi">${l}<b>${esc(val)}</b></div>`;
  v("tStats").innerHTML = `<div class="stats">${kpi("Resolution rate", rate)}${kpi("Avg resolution time", avg)}${kpi("Most common issue", top ? top[0] : "-")}${kpi("Documented fixes", res.filter(t => t.steps).length)}</div>
    <div class="grid2">${bars("Tickets by category", tally(all, t => t.category))}${bars("Tickets by severity", tally(all, t => t.severity))}
    ${bars("Tickets by department", tally(all, t => t.department))}${bars("Resolved per admin", tally(res, t => t.resolvedBy))}</div>`;
}

// ----- Knowledge base tab -----
function renderKb(){
  const q = v("kbQ").value.toLowerCase(), cat = v("kbCat").value;
  const list = all.filter(t => t.steps && (!cat || t.category === cat) && (t.details+t.rootCause+t.steps).toLowerCase().includes(q));
  v("kbList").innerHTML = list.length ? list.map(t => `<div class="card kb"><h3>${esc(t.category)} - ${esc(t.details)}</h3>
    <small>${esc(t.department)} - ${esc(t.severity)} - resolved by ${esc(t.resolvedBy)} on ${esc(when(t))}${t0(t) && t1(t) ? " (took " + dur(t1(t)-t0(t)) + ")" : ""}</small>
    <p><b>Root cause:</b> ${esc(t.rootCause)}</p><p><b>Steps taken:</b>\n${esc(t.steps)}</p></div>`).join("")
    : '<div class="card muted">No documented fixes yet. Resolve a ticket and document the steps to start the knowledge base.</div>';
}
["kbQ","kbCat"].forEach(id => v(id).addEventListener("input", renderKb));

// ----- Tabs -----
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("hidden", p.id !== b.dataset.tab));
});

// ----- Admins tab: add / rename / remove -----
let seeding = false;
async function loadAdmins(){
  try{
    admins = await dbAdmins();
    if(!admins.length && !seeding){ seeding = true; for(const n of DEFAULT_ADMINS) await dbAddAdmin(n); admins = await dbAdmins(); seeding = false; }
  }catch(e){ console.error(e); seeding = false; toast("Could not load admins - publish the updated firestore.rules"); admins = DEFAULT_ADMINS.map((n,i) => ({ id:"local"+i, name:n })); }
  v("mWho").innerHTML = opts(names(), "Select admin...");
}
function renderAdmins(){
  const open = n => all.filter(t => t.assignedTo === n && t.status !== "Resolved").length, done = n => all.filter(t => t.resolvedBy === n).length;
  v("adList").innerHTML = admins.map(a => `<tr><td><input data-name="${esc(a.id)}" value="${esc(a.name)}" maxlength="60"></td>
    <td>${open(a.name)}</td><td>${done(a.name)}</td>
    <td><button class="btn dark" data-save="${esc(a.id)}">Save</button> <button class="btn dark" data-del="${esc(a.id)}">Remove</button></td></tr>`).join("");
}
const nameOk = (n, exceptId) => n.length >= 2 && n.length <= 60 && !admins.some(a => a.id !== exceptId && a.name.toLowerCase() === n.toLowerCase());

v("adAdd").onclick = async () => {
  const n = v("adNew").value.trim();
  if(!nameOk(n)){ toast("Enter a unique name (2-60 characters)"); return; }
  try{ await dbAddAdmin(n); v("adNew").value = ""; await load(); toast("Admin added"); }
  catch(e){ console.error(e); toast("Could not add: " + (e.code || e.message)); }
};
v("adList").addEventListener("click", async e => {
  const sid = e.target.dataset.save, did = e.target.dataset.del;
  const a = admins.find(x => x.id === (sid || did)); if(!a) return;
  try{
    if(sid){
      const n = document.querySelector(`[data-name="${sid}"]`).value.trim();
      if(n === a.name) return;
      if(!nameOk(n, sid)){ toast("Enter a unique name (2-60 characters)"); return; }
      await dbEditAdmin(sid, n);
      // keep ticket history consistent with the new name
      await Promise.all(all.filter(t => t.assignedTo === a.name || t.resolvedBy === a.name).map(t => dbPatch(t.id, {
        ...(t.assignedTo === a.name ? { assignedTo: n } : {}), ...(t.resolvedBy === a.name ? { resolvedBy: n } : {}) })));
      await load(); toast("Admin renamed");
    }
    if(did){
      if(admins.length <= 1){ toast("Keep at least one admin"); return; }
      const mine = all.filter(t => t.assignedTo === a.name && t.status !== "Resolved");
      if(!confirm(`Remove ${a.name}?` + (mine.length ? ` ${mine.length} open ticket(s) assigned to them will become unassigned.` : "") + " Resolved tickets keep their name in the history.")) return;
      await Promise.all(mine.map(t => dbPatch(t.id, { assignedTo: "", status: "Unresolved" })));
      await dbDelAdmin(did); await load(); toast("Admin removed");
    }
  }catch(err){ console.error(err); toast("Failed: " + (err.code || err.message)); }
});

// ----- Reports tab: period filter, CSV (Excel) download, printable PDF report -----
let me = "";
const inRange = t => {
  const f = v("rFrom").value, to = v("rTo").value, c = t0(t);
  if(c === null) return !f && !to;
  return c >= (f ? new Date(f).getTime() : 0) && c < (to ? new Date(to).getTime() + 864e5 : Infinity);
};
const period = () => (v("rFrom").value || v("rTo").value) ? `${v("rFrom").value || "start"} to ${v("rTo").value || "today"}` : "All time";

// Cells starting with = + - @ are prefixed so Excel can never run them as formulas
const cell = x => { let s = String(x ?? ""); if(/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function downloadCsv(){
  const head = ["Submitted","Name","Email","Department","Category","Severity","Details","Status","Assigned to","Resolved by","Resolved at","Resolution time (min)","Root cause","Troubleshooting steps"];
  const body = all.filter(inRange).map(t => [t.at, t.name, t.email, t.department, t.category, t.severity, t.details, t.status, t.assignedTo || "", t.resolvedBy || "",
    t1(t) ? new Date(t1(t)).toLocaleString() : "", t0(t) && t1(t) ? Math.round((t1(t) - t0(t)) / 60000) : "", t.rootCause || "", t.steps || ""]);
  const blob = new Blob(["\ufeff" + [head, ...body].map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "xytron-tsg-tickets-" + new Date().toISOString().slice(0,10) + ".csv"; a.click(); URL.revokeObjectURL(a.href);
  toast(body.length + " tickets exported");
}

function renderReport(){
  const l = all.filter(inRange), res = l.filter(t => t.status === "Resolved");
  const times = res.filter(t => t0(t) && t1(t)).map(t => t1(t) - t0(t));
  const avgOf = a => a.length ? dur(a.reduce((x,y) => x+y, 0) / a.length) : "-";
  const cnt = s => l.filter(t => t.status === s).length;
  const rate = l.length ? Math.round(res.length / l.length * 100) + "%" : "-";
  const tb = (title, counts) => { const e = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    return `<div><h3>${title}</h3><table><tr><th>Item</th><th>Tickets</th><th>Share</th></tr>${e.map(([k,n]) => `<tr><td>${esc(k)}</td><td>${n}</td><td>${Math.round(n/l.length*100)}%</td></tr>`).join("") || '<tr><td colspan="3">No data</td></tr>'}</table></div>`; };
  const people = [...new Set(l.flatMap(t => [t.assignedTo, t.resolvedBy]).filter(Boolean))];
  const adminRows = people.map(n => { const mine = res.filter(t => t.resolvedBy === n);
    return `<tr><td>${esc(n)}</td><td>${l.filter(t => t.assignedTo === n && t.status !== "Resolved").length}</td><td>${mine.length}</td><td>${avgOf(mine.filter(t => t0(t) && t1(t)).map(t => t1(t) - t0(t)))}</td></tr>`; }).join("");
  const docs = res.filter(t => t.steps).map(t => `<tr><td>${esc(t.category)}</td><td>${esc(t.details)}</td><td>${esc(t.rootCause)}</td><td style="white-space:pre-wrap">${esc(t.steps)}</td><td>${esc(t.resolvedBy)}</td></tr>`).join("");
  const log = l.map(t => `<tr><td>${esc(t.at)}</td><td>${esc(t.name)}</td><td>${esc(t.department)}</td><td>${esc(t.category)}</td><td>${esc(t.severity)}</td><td>${esc(t.status)}</td><td>${esc(t.resolvedBy || t.assignedTo || "")}</td></tr>`).join("");
  const kpi = (a, b) => `<div class="stat kpi">${a}<b>${esc(b)}</b></div>`;
  v("rpt").innerHTML = `<h1>XYTRON TSG Ticketing System</h1><h2 style="margin-top:6px">Ticket Statistics Report</h2>
    <p class="muted">Period: ${esc(period())}<br>Generated: ${new Date().toLocaleString()} by ${esc(me)}</p>
    <div class="stats" style="margin-top:14px">${kpi("Total tickets", l.length)}${kpi("Unresolved", cnt("Unresolved"))}${kpi("In progress", cnt("In Progress"))}${kpi("Resolved", res.length)}</div>
    <div class="stats">${kpi("Resolution rate", rate)}${kpi("Avg resolution time", avgOf(times))}${kpi("Documented fixes", res.filter(t => t.steps).length)}${kpi("Critical tickets", l.filter(t => t.severity === "Critical").length)}</div>
    <div class="grid2">${tb("By category", tally(l, t => t.category))}${tb("By severity", tally(l, t => t.severity))}${tb("By department", tally(l, t => t.department))}
    <div><h3>By network admin</h3><table><tr><th>Admin</th><th>Open</th><th>Resolved</th><th>Avg time</th></tr>${adminRows || '<tr><td colspan="4">No data</td></tr>'}</table></div></div>
    <h3>Documented resolutions</h3><table><tr><th>Category</th><th>Issue</th><th>Root cause</th><th>Steps taken</th><th>Resolved by</th></tr>${docs || '<tr><td colspan="5">None in this period</td></tr>'}</table>
    <h3>Ticket log</h3><table><tr><th>Submitted</th><th>Name</th><th>Dept</th><th>Category</th><th>Severity</th><th>Status</th><th>Handled by</th></tr>${log || '<tr><td colspan="7">No tickets in this period</td></tr>'}</table>`;
}
["rFrom","rTo"].forEach(id => v(id).addEventListener("input", renderReport));
v("rCsv").onclick = downloadCsv;
v("rPrint").onclick = () => { renderReport(); const old = document.title; document.title = "Xytron-TSG-Report-" + new Date().toISOString().slice(0,10); window.print(); document.title = old; };

// ----- Remove (hide) tickets, restore, delete forever -----
// "Removed" tickets are filtered out of `all`, so statistics, knowledge base, reports and exports stay clean.
v("rows").addEventListener("click", async e => {
  const id = e.target.dataset.remove; if(!id) return;
  if(!confirm("Remove this ticket? It will be hidden from the registry, statistics and reports. You can restore it later.")) return;
  const t = all.find(x => x.id === id);
  try{ await dbPatch(id, { status: "Removed", prevStatus: t.status }); await load(); toast("Ticket removed"); }
  catch(err){ console.error(err); toast("Could not remove: " + (err.code || err.message)); }
});
function renderRemoved(){
  v("rmCard").classList.toggle("hidden", !removed.length);
  v("rmCount").textContent = removed.length;
  v("rmRows").innerHTML = removed.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.department)}</td><td>${esc(t.details)}</td><td>${esc(t.at)}</td>
    <td><button class="btn dark" data-restore="${esc(t.id)}">Restore</button> <button class="btn dark" data-purge="${esc(t.id)}">Delete forever</button></td></tr>`).join("");
}
v("rmRows").addEventListener("click", async e => {
  const rid = e.target.dataset.restore, pid = e.target.dataset.purge, id = rid || pid; if(!id) return;
  const t = removed.find(x => x.id === id); if(!t) return;
  try{
    if(rid){ await dbPatch(id, { status: t.prevStatus || "Unresolved" }); await load(); toast("Ticket restored"); }
    else if(confirm("Delete this ticket forever? This cannot be undone.")){ await dbDelTicket(id); await load(); toast("Ticket deleted permanently"); }
  }catch(err){ console.error(err); toast("Failed: " + (err.code || err.message)); }
});

// ----- Follow-up requests from users: alert bar, tab title, highlighted tickets -----
let follows = [], followWarned = false;
const refOf = t => "XT-" + String(t.id).slice(0, 6).toUpperCase();
const pendingFor = t => follows.filter(f => !f.handled && f.ref === refOf(t));
async function loadFollows(){
  try{ follows = await dbFollowList(); }
  catch(e){ console.error(e); follows = []; if(!followWarned){ followWarned = true; toast("Follow-ups unavailable - publish the updated firestore.rules"); } }
}
function renderFollows(){
  const p = follows.filter(f => !f.handled), n = p.length;
  v("fuCard").classList.toggle("hidden", !n); v("alertBar").classList.toggle("hidden", !n); v("fuCount").textContent = n;
  v("alertText").textContent = n + (n === 1 ? " follow-up request needs" : " follow-up requests need") + " your attention";
  document.title = (n ? "(" + n + ") " : "") + "Admin | Xytron TSG";
  v("fuRows").innerHTML = p.map(f => {
    const t = all.find(x => refOf(x) === f.ref), r = !t && removed.find(x => refOf(x) === f.ref);
    const info = t ? `${esc(t.name)}: ${esc(t.details)} (${esc(t.status)})` : r ? "Removed ticket" : "No ticket found for this reference";
    const when = f.createdAt?.toMillis ? new Date(f.createdAt.toMillis()).toLocaleString() : esc(f.at);
    return `<tr><td><b>${esc(f.ref)}</b></td><td>${info}</td><td>${esc(f.note || "-")}</td><td>${esc(f.name)}</td><td>${when}</td><td><button class="btn dark" data-fuh="${esc(f.id)}">Mark handled</button></td></tr>`;
  }).join("");
}
v("fuRows").addEventListener("click", async e => {
  const id = e.target.dataset.fuh; if(!id) return;
  try{ await dbFollowHandle(id); await load(); toast("Follow-up marked as handled"); }
  catch(err){ console.error(err); toast("Could not update: " + (err.code || err.message)); }
});
v("alertGo").onclick = () => { document.querySelector('[data-tab="tTickets"]').click(); v("fuCard").scrollIntoView({ behavior: "smooth" }); };
// Check for new follow-ups every 45 seconds without a page reload
setInterval(async () => {
  if(!me) return;
  const before = follows.filter(f => !f.handled).length; await loadFollows();
  const after = follows.filter(f => !f.handled).length;
  if(after !== before){ renderTickets(); renderFollows(); if(after > before) toast("New follow-up request"); }
}, 45000);
