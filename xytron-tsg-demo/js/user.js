/* REQUESTER PAGE - one question at a time in an animated card, with a live ticket preview. Submit only. */
import { dbAdd, dbFollowAdd, toast, esc } from "./db.js";
const $ = id => document.getElementById(id);

// Company data. If you change these lists, update firestore.rules to match.
const DEPTS = ["Printing","Sorting","Accounting","PST","MIS","Courier","Alchemy"];
const CATS = [["Hardware","Computer, monitor, scanner or other device"],["Software","App errors, installs, updates"],["Network","WiFi, LAN, VPN or internet"],
  ["Printer","Won't print, paper jam, not detected"],["Account Access","Login, password or permissions"],["Others","Anything else, explain on the next step"]];
const SEV = [["Low","Minor issue. I can keep working."],["Medium","It slows my work down."],["High","I can't do part of my work."],["Critical","Work has stopped, or many people are affected."]];
const QUICK = { Network:["No internet","Can't connect to WiFi","Can't reach the router","Network is slow"], Hardware:["Computer won't start","Monitor shows no display","Keyboard or mouse not working"],
  Software:["An application keeps crashing","Can't install an update","System won't load"], Printer:["Printer won't print","Paper jam","Printer not detected"],
  "Account Access":["Forgot my password","My account is locked","Need access to a folder"], Others:[] };
const STEPS = ["Who","Problem","Urgency","Details","Review"], KEY = "xy_me";
let d = {}, rem = false, s = 0, timer = null, busy = false;

function reset(){
  let me = {}; try{ me = JSON.parse(localStorage.getItem(KEY) || "{}"); }catch(e){}
  d = { name: me.name || "", email: me.email || "", department: me.department || "", category: "", severity: "", details: "" };
  rem = !!me.name; s = 0;
}
const gates = [() => d.name.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(d.email.trim()) && !!d.department, () => !!d.category, () => !!d.severity, () => d.details.trim().length >= 10, () => true];
const need = ["Enter your name, a valid work email and choose a department.","Choose the kind of problem.","Choose how urgent it is.","Describe what happened (at least 10 characters).",""];
const chip = (key, v, sub) => `<button type="button" class="chip" role="radio" aria-checked="${d[key] === v}" data-key="${key}" data-val="${esc(v)}">${esc(v)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;

function body(){
  if(s === 0) return `<h3>Who's reporting?</h3><p class="sub">So TSG knows who to contact.</p>
    <div class="two"><label>Full name<input id="iName" maxlength="80" value="${esc(d.name)}"></label><label>Work email<input id="iEmail" type="email" maxlength="100" value="${esc(d.email)}"></label></div>
    <span class="form-lab">Department</span><div class="chips" role="radiogroup" aria-label="Department">${DEPTS.map(x => chip("department", x)).join("")}</div>
    <label class="remember"><input type="checkbox" id="iRem" ${rem ? "checked" : ""}> Remember me on this computer</label>`;
  if(s === 1) return `<h3>What kind of problem?</h3><p class="sub">Pick the closest match.</p><div class="chips cats" role="radiogroup" aria-label="Category">${CATS.map(([v,h]) => chip("category", v, h)).join("")}</div>`;
  if(s === 2) return `<h3>How urgent is it?</h3><p class="sub">Choose how much it blocks your work.</p><div class="chips cats" role="radiogroup" aria-label="Severity">${SEV.map(([v,h]) => chip("severity", v, h)).join("")}</div>`;
  if(s === 3) return `<h3>What happened?</h3><p class="sub">Include the computer or area, and any error message.</p>
    <div class="chips quick">${(QUICK[d.category] || []).map(t => `<button type="button" class="chip" data-quick="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <textarea id="iDet" maxlength="300" placeholder="Describe the problem">${esc(d.details)}</textarea><div class="count"><span id="cnt">${d.details.length}</span>/300</div>`;
  return `<h3>Ready to send?</h3><p class="sub">Check the ticket, then send it to TSG.</p><dl class="sum"><dt>From</dt><dd>${esc(d.name)}, ${esc(d.email)}</dd>
    <dt>Department</dt><dd>${esc(d.department)}</dd><dt>Problem</dt><dd>${esc(d.category)}, ${esc(d.severity)} urgency</dd><dt>Details</dt><dd>${esc(d.details)}</dd></dl>`;
}
function render(){
  $("qbody").innerHTML = body();
  $("track").innerHTML = STEPS.map((t,i) => `<button type="button" class="tk ${i === s ? "on" : i < s ? "done" : ""}" data-go="${i}" ${i > s ? "disabled" : ""}><i></i>${t}</button>`).join("");
  $("back").style.visibility = s ? "visible" : "hidden"; $("next").textContent = s === 4 ? "Send ticket" : "Next";
  refresh();
}
function refresh(){ $("next").disabled = busy || !gates[s](); $("missing").textContent = gates[s]() ? "" : need[s]; sync(); }
function setDd(id, val){ const el = $(id); if(el.textContent !== val){ el.textContent = val; if(val){ el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } } }
function sync(){
  const done = [d.name.trim().length >= 2, /^\S+@\S+\.\S+$/.test(d.email.trim()), !!d.department, !!d.category, !!d.severity, d.details.trim().length >= 10].filter(Boolean).length;
  setDd("pName", d.name.trim()); setDd("pDept", d.department); setDd("pCat", d.category); setDd("pSev", d.severity); setDd("pDet", d.details.trim());
  $("bar").style.width = done / 6 * 100 + "%"; $("ready").textContent = done + " of 6 filled in";
}
function go(n){
  if(n === s || n < 0 || n > 4) return; clearTimeout(timer);
  const b = $("qbody"), fwd = n > s; b.className = "qbody " + (fwd ? "outL" : "outR");
  setTimeout(() => { s = n; render(); b.className = "qbody " + (fwd ? "inR" : "inL"); b.querySelector("input:not([type=checkbox]),textarea")?.focus(); }, 170);
}
const advance = () => s === 4 ? submit() : (gates[s]() && go(s + 1));

document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"); if(g){ go(+g.dataset.go); return; }
  const b = e.target.closest(".chip"); if(!b) return;
  if(b.dataset.key){ d[b.dataset.key] = b.dataset.val; render(); }
  if(b.dataset.quick){ d.details = (d.details.trim() ? d.details.trim() + "\n" + b.dataset.quick : b.dataset.quick).slice(0, 300); $("iDet").value = d.details; $("cnt").textContent = d.details.length; refresh(); }
});
document.addEventListener("input", e => {
  const k = { iName: "name", iEmail: "email", iDet: "details" }[e.target.id]; if(!k) return;
  d[k] = e.target.value; if(k === "details") $("cnt").textContent = d.details.length; refresh();
});
document.addEventListener("change", e => { if(e.target.id === "iRem") rem = e.target.checked; });
document.addEventListener("keydown", e => {
  if(e.key === "Enter" && !e.target.closest("#fu") && (e.target.tagName === "INPUT" && e.target.type !== "checkbox" || e.ctrlKey && e.target.tagName === "TEXTAREA")){ e.preventDefault(); advance(); }
});
$("next").onclick = advance; $("back").onclick = () => go(s - 1);

async function submit(){
  if(busy) return; busy = true; refresh();
  const t = { name: d.name.trim(), email: d.email.trim(), department: d.department, category: d.category, severity: d.severity,
    details: d.details.trim(), status: "Unresolved", at: new Date().toLocaleString() };
  try{
    const id = await dbAdd(t), ref = "XT-" + String(id).slice(0, 6).toUpperCase();
    try{ if(rem) localStorage.setItem(KEY, JSON.stringify({ name: t.name, email: t.email, department: t.department })); else localStorage.removeItem(KEY); }catch(err){}
    $("ref").textContent = ref; $("bigRef").textContent = ref;
    $("qcard").classList.add("hidden"); $("track").classList.add("hidden"); $("done").classList.remove("hidden"); $("stub").classList.add("sent");
    toast("Ticket sent");
  }catch(err){ console.error(err); toast("Ticket not sent: " + (err.code || err.message)); }
  busy = false; refresh();
}
$("copy").onclick = () => { navigator.clipboard?.writeText($("bigRef").textContent).then(() => toast("Reference copied")).catch(() => toast("Select and copy the reference manually")); };
$("again").onclick = () => {
  reset(); ["pName","pDept","pCat","pSev","pDet"].forEach(id => $(id).textContent = "");
  $("done").classList.add("hidden"); $("qcard").classList.remove("hidden"); $("track").classList.remove("hidden");
  $("stub").classList.remove("sent"); $("ref").textContent = "Not sent yet"; $("qbody").className = "qbody"; render();
};
reset(); render();

// ----- Follow up on a sent ticket (alerts the admin console) -----
const openFu = ref => { $("fuRef").value = ref || ""; $("fuName").value = d.name || ""; $("fuNote").value = ""; $("fu").classList.remove("hidden"); $("fuRef").focus(); };
const closeFu = () => $("fu").classList.add("hidden");
$("fuOpen").onclick = () => openFu(); $("fuCancel").onclick = closeFu;
$("fuRef").oninput = e => { e.target.value = e.target.value.toUpperCase(); };
document.addEventListener("keydown", e => { if(e.key === "Escape") closeFu(); if(e.key === "Enter" && e.target.closest("#fu") && e.target.tagName === "INPUT") $("fuSend").click(); });
$("fuSend").onclick = async () => {
  const ref = $("fuRef").value.trim().toUpperCase(), name = $("fuName").value.trim().slice(0, 80), note = $("fuNote").value.trim().slice(0, 300);
  if(!/^XT-[A-Z0-9]{6}$/.test(ref)){ toast("Enter the reference exactly as shown, like XT-4F7K2A"); return; }
  if(name.length < 2){ toast("Enter your name"); return; }
  let last = 0; try{ last = +localStorage.getItem("xy_fu_" + ref) || 0; }catch(e){}
  if(Date.now() - last < 30 * 60000){ toast("You already sent a follow-up for this ticket. TSG has been alerted."); return; }
  $("fuSend").disabled = true;
  try{
    await dbFollowAdd({ ref, name, note, at: new Date().toLocaleString() });
    try{ localStorage.setItem("xy_fu_" + ref, Date.now()); }catch(e){}
    closeFu(); toast("Follow-up sent. TSG has been alerted.");
  }catch(err){ console.error(err); toast("Follow-up not sent: " + (err.code || err.message)); }
  $("fuSend").disabled = false;
};

// ----- Welcome screen -----
$("start").onclick = () => {
  $("welcome").classList.add("hidden"); $("flow").classList.remove("hidden");
  $("qbody").className = "qbody inR"; $("qbody").querySelector("input:not([type=checkbox])")?.focus();
};
$("fuOpen2").onclick = () => openFu();
