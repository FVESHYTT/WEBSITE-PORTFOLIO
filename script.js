// Sidebar highlight: follows scrolling, but a clicked link wins until you scroll yourself
const links = [...document.querySelectorAll('nav a[href^="#"]')];
const targets = [...document.querySelectorAll('main section[id], main article[id]')];
let locked = false;
if (targets.length) {

function show(id) {
  links.forEach(l => {
    const on = l.getAttribute('href') === '#' + id;
    l.classList.toggle('active', on);
    if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
  });
}

function setActive() {
  if (locked) return;
  const line = window.innerHeight * 0.35;
  let current = targets[0];
  targets.forEach(t => { if (t.getBoundingClientRect().top <= line) current = t; });
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    current = targets[targets.length - 1];
  }
  show(current.id);
}

links.forEach(l => l.addEventListener('click', () => {
  locked = true;
  show(l.getAttribute('href').slice(1));
}));
['wheel', 'touchmove', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => { locked = false; }, { passive: true }));
window.addEventListener('scroll', setActive, { passive: true });
window.addEventListener('resize', setActive);
setActive();
}

// Decorative network animation: falling 0s and 1s plus drifting network nodes.
// Used in the sidebar (softer, so the menu stays easy to read) and in the wide-screen right panel.
function startNet(id, dim, avoid) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = '196,212,240', HEAD = '52,211,153', S = 16, TAIL = 14;
  let w, h, cols, heads, speeds, nodes, zones = [];

  // Areas of text that the animation should stay quiet behind
  function measure() {
    zones = [];
    if (!avoid) return;
    const cr = cv.getBoundingClientRect();
    document.querySelectorAll(avoid).forEach(el => {
      const r = el.getBoundingClientRect();
      zones.push({ x1: r.left - cr.left - 8, y1: r.top - cr.top - 8, x2: r.right - cr.left + 8, y2: r.bottom - cr.top + 8 });
    });
  }
  const quiet = (x1, y1, x2, y2) => zones.some(z => x1 < z.x2 && x2 > z.x1 && y1 < z.y2 && y2 > z.y1) ? 0.12 : 1;

  function init() {
    const dpr = window.devicePixelRatio || 1;
    w = cv.clientWidth; h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measure();
    cols = Math.floor(w / S);
    heads = Array.from({ length: cols }, () => Math.random() * (h / S + TAIL));
    speeds = Array.from({ length: cols }, () => 0.08 + Math.random() * 0.22);
    nodes = Array.from({ length: Math.max(7, Math.round(w * h / 28000)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35
    }));
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.font = S + 'px ui-monospace, Consolas, monospace';
    for (let i = 0; i < cols; i++) {
      const head = Math.floor(heads[i]);
      for (let k = 0; k < TAIL; k++) {
        const row = head - k;
        if (row < 0 || row * S > h) continue;
        const bit = (((i * 73856093) ^ (row * 19349663)) >> 3) & 1;
        const q = quiet(i * S, row * S - S, i * S + S, row * S);
        ctx.fillStyle = k === 0
          ? 'rgba(' + HEAD + ',' + (0.95 * dim * q) + ')'
          : 'rgba(' + C + ',' + (0.34 * dim * q * (1 - k / TAIL)) + ')';
        ctx.fillText(bit, i * S, row * S);
      }
    }
    ctx.lineWidth = 1.5;
    nodes.forEach((a, i) => {
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 190) {
          ctx.strokeStyle = 'rgba(' + C + ',' + (0.5 * dim * (1 - d / 190)) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    });
    nodes.forEach(n => {
      ctx.fillStyle = '#04080F'; ctx.strokeStyle = 'rgba(' + HEAD + ',' + ((0.35 + 0.65 * dim) * quiet(n.x - 7, n.y - 7, n.x + 7, n.y + 7)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(n.x, n.y, 5, 0, 7); ctx.fill(); ctx.stroke();
    });
  }

  function step() {
    for (let i = 0; i < cols; i++) {
      heads[i] += speeds[i];
      if ((heads[i] - TAIL) * S > h) heads[i] = 0;
    }
    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    });
  }

  let last = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (document.hidden || t - last < 33) return;
    last = t; step(); draw();
  }

  new ResizeObserver(init).observe(cv);
  init();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  if (!reduce) requestAnimationFrame(loop);
}
startNet('net-side', 0.85, '.sidebar .name, .sidebar .role, .sidebar nav a');

// Certificate viewer (uses the built-in dialog element; links still work without JavaScript)
(function () {
  const viewer = document.getElementById('viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  const img = document.getElementById('viewer-img');
  const title = document.getElementById('viewer-title');
  const dl = document.getElementById('viewer-dl');
  let opener = null;
  document.querySelectorAll('a[data-viewer]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    opener = a;
    img.src = a.getAttribute('href');
    img.alt = a.dataset.alt || '';
    title.textContent = a.dataset.title || '';
    dl.href = a.getAttribute('href');
    dl.setAttribute('download', a.getAttribute('href').split('/').pop());
    viewer.showModal();
  }));
  document.getElementById('viewer-close').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => { if (opener) opener.focus(); });
})();
