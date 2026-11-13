/* DEMO DB - runs entirely in the visitor's browser (localStorage). No Firebase, no keys, no real data.
   Same function names as the live Firebase version, so user.js and admin.js are unchanged. */
const K = { t: "xyd_tickets", a: "xyd_admins", f: "xyd_follow" };
const hrs = h => Date.now() - h * 36e5;
const stamp = ms => ({ toMillis: () => ms });
const nid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const SEED_T = [
  { id: "k4n7p2x9qa", name: "Ana Reyes", email: "ana@example.com", department: "Courier", category: "Network", severity: "Critical", details: "No internet in the dispatch area", status: "In Progress", assignedTo: "Demo Admin", at: "Demo data", createdAt: hrs(3) },
  { id: "m8d2f6h1zb", name: "Mark Lim", email: "mark@example.com", department: "MIS", category: "Software", severity: "Low", details: "Cannot install the latest update", status: "Unresolved", at: "Demo data", createdAt: hrs(5) },
  { id: "p3w9c5t7yc", name: "Maria Santos", email: "maria@example.com", department: "Printing", category: "Printer", severity: "High", details: "Printer on the 2nd floor shows offline", status: "Resolved", assignedTo: "Demo Admin", resolvedBy: "Demo Admin",
    rootCause: "Printer lost its static IP after a power cut", steps: "1. Pinged the printer IP and got no reply\n2. Checked the DHCP scope and found a new lease\n3. Added a reservation and restarted the printer", at: "Demo data", createdAt: hrs(30), resolvedAt: hrs(28) },
  { id: "r6j1v4b8ud", name: "Juan Dela Cruz", email: "juan@example.com", department: "Accounting", category: "Account Access", severity: "Medium", details: "Account locked after several password attempts", status: "Resolved", assignedTo: "Second Admin", resolvedBy: "Second Admin",
    rootCause: "Lockout policy triggered by repeated wrong passwords", steps: "1. Confirmed the lock in Active Directory\n2. Unlocked the account and reset the password\n3. Asked the user to sign in again", at: "Demo data", createdAt: hrs(52), resolvedAt: hrs(51.5) }
];
const SEED_A = [{ id: "a1", name: "Demo Admin" }, { id: "a2", name: "Second Admin" }];
const SEED_F = [{ id: "f1", ref: "XT-K4N7P2", name: "Ana Reyes", note: "Still no internet, the whole team is waiting.", at: "Demo data", handled: false, createdAt: hrs(1) }];

const wr = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };
const rd = (k, seed) => { try{ const v = JSON.parse(localStorage.getItem(k)); if(v) return v; }catch(e){} wr(k, seed); return JSON.parse(JSON.stringify(seed)); };
const upd = f => { const l = rd(K.t, SEED_T); f(l); wr(K.t, l); };
const find = (l, id) => l.find(x => x.id === id);

// Tickets
export async function dbAdd(t){ const l = rd(K.t, SEED_T), id = nid(); l.unshift({ ...t, id, createdAt: Date.now() }); wr(K.t, l); return id; }
export async function dbList(){ return rd(K.t, SEED_T).map(x => ({ ...x, createdAt: stamp(x.createdAt), resolvedAt: x.resolvedAt ? stamp(x.resolvedAt) : undefined })); }
export async function dbAssign(id, name){ upd(l => { const t = find(l, id); if(t){ t.assignedTo = name; t.status = name ? "In Progress" : "Unresolved"; } }); }
export async function dbResolve(id, info){ upd(l => { const t = find(l, id); if(t) Object.assign(t, info, { status: "Resolved", resolvedAt: Date.now() }); }); }
export async function dbPatch(id, f){ upd(l => { const t = find(l, id); if(t) Object.assign(t, f); }); }
export async function dbDelTicket(id){ wr(K.t, rd(K.t, SEED_T).filter(x => x.id !== id)); }
// Admin names
export async function dbAdmins(){ return rd(K.a, SEED_A).slice().sort((a, b) => a.name.localeCompare(b.name)); }
export async function dbAddAdmin(name){ const l = rd(K.a, SEED_A); l.push({ id: nid(), name }); wr(K.a, l); }
export async function dbEditAdmin(id, name){ const l = rd(K.a, SEED_A), a = find(l, id); if(a) a.name = name; wr(K.a, l); }
export async function dbDelAdmin(id){ wr(K.a, rd(K.a, SEED_A).filter(x => x.id !== id)); }
// Follow-ups
export async function dbFollowAdd(f){ const l = rd(K.f, SEED_F); l.unshift({ ...f, id: nid(), handled: false, createdAt: Date.now() }); wr(K.f, l); }
export async function dbFollowList(){ return rd(K.f, SEED_F).map(x => ({ ...x, createdAt: stamp(x.createdAt) })); }
export async function dbFollowHandle(id){ const l = rd(K.f, SEED_F), f = find(l, id); if(f) f.handled = true; wr(K.f, l); }

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),3000)}
