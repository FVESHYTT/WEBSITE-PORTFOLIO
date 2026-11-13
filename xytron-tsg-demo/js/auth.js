/* DEMO AUTH - not real security. Signs a demo admin in for this browser tab only. */
const DEMO = { email: "demo@xytron.com", password: "demo1234" };
const subs = [], user = () => sessionStorage.getItem("xyd_admin") ? { email: DEMO.email } : null;
export async function login(e, p){
  if(e.trim().toLowerCase() === DEMO.email && p === DEMO.password){ sessionStorage.setItem("xyd_admin", "1"); subs.forEach(cb => cb(user())); return true; }
  return "Use the demo account shown below the form.";
}
export const logout = () => { sessionStorage.removeItem("xyd_admin"); location.reload(); };
export const watchAuth = cb => { subs.push(cb); cb(user()); };
