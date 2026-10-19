const N = 21, CELL = 20, WIN = 20;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
// cryptic severance-style labels for each relative move
const WORDS = ['Dread','Woe','Frolic','Malice'];
let snake, dir, food, walls, ink, tick, mode, paused, over, ticks;

function reset() {
  snake = [[10,10],[9,10],[8,10]]; dir = 1; food = null; walls = new Set();
  ink = 10; ticks = 0; mode = 'food'; paused = false; over = false;
  $('msg').textContent = ''; setMode('food'); hud(); draw();
}
function setMode(m) {
  mode = m;
  $('mFood').classList.toggle('on', m === 'food');
  $('mWall').classList.toggle('on', m === 'wall');
}
const key = (x, y) => x + ',' + y;
function blocked(x, y, body) {
  if (x < 0 || y < 0 || x >= N || y >= N) return true;
  if (walls.has(key(x, y))) return true;
  return body.some(s => s[0] === x && s[1] === y);
}
function hud() { $('len').textContent = snake.length; $('ink').textContent = ink; }

function step() {
  if (over || paused) return;
  const head = snake[0], tail = snake[snake.length - 1];
  const body = snake.slice(0, -1); // tail cell frees up as we move
  const cand = [];
  for (const rel of [-1, 0, 1]) {
    const d = (dir + rel + 4) % 4, x = head[0] + DIRS[d][0], y = head[1] + DIRS[d][1];
    if (blocked(x, y, body)) continue;
    let score = 1;
    if (food) score += 6 / (1 + Math.abs(food[0]-x) + Math.abs(food[1]-y));
    // room to breathe: count free neighbours
    let free = 0;
    for (const [dx,dy] of DIRS) if (!blocked(x+dx, y+dy, body)) free++;
    score += free;
    cand.push({ d, x, y, w: Math.exp(score / 2), rel });
  }
  showOptions(cand);
  if (!cand.length) { over = true; $('msg').textContent = 'no legal move. the environment wins.'; return; }
  // pick in proportion to weight (ranked probabilistic choice)
  const total = cand.reduce((a, c) => a + c.w, 0);
  let r = Math.random() * total, pick = cand[0];
  for (const c of cand) { r -= c.w; if (r <= 0) { pick = c; break; } }
  pick.chosen = true; showOptions(cand);
  dir = pick.d; snake.unshift([pick.x, pick.y]);
  if (food && food[0] === pick.x && food[1] === pick.y) food = null;
  else snake.pop();
  ticks++;
  if (ticks % 4 === 0 && ink < 10) ink++;
  if (snake.length >= WIN) { over = true; $('msg').textContent = 'the snake reached ' + WIN + '. the snake wins.'; }
  hud(); draw();
}
function showOptions(cand) {
  const el = $('opts'); el.textContent = '';
  const total = cand.reduce((a, c) => a + c.w, 0) || 1;
  const decoys = 2;
  const rows = cand.map(c => ({ label: WORDS[c.d] + ' ' + (c.d * 7 + 3) + String.fromCharCode(65 + c.rel + 1), p: c.w / total, pick: c.chosen }));
  for (let i = 0; i < decoys; i++) rows.push({ label: WORDS[(i + 2) % 4] + ' ' + Math.floor(Math.random() * 99) + '?', p: 0, junk: true });
  rows.sort((a, b) => b.p - a.p);
  for (const r of rows) {
    const d = document.createElement('div');
    if (r.pick) d.className = 'pick';
    const s = document.createElement('span'); s.textContent = r.label;
    const p = document.createElement('span'); p.textContent = r.junk ? '—' : Math.round(r.p * 100) + '%';
    d.append(s, p);
    const b = document.createElement('div'); b.className = 'bar'; b.style.width = (r.p * 100) + '%'; b.style.padding = '0'; b.style.border = '0';
    d.style.flexWrap = 'wrap'; d.appendChild(b);
    el.appendChild(d);
  }
}
function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = '#10302a';
  for (let i = 0; i <= N; i++) {
    ctx.beginPath(); ctx.moveTo(i*CELL,0); ctx.lineTo(i*CELL,N*CELL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i*CELL); ctx.lineTo(N*CELL,i*CELL); ctx.stroke();
  }
  ctx.fillStyle = '#6b7f7a';
  for (const k of walls) { const [x,y] = k.split(',').map(Number); ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2); }
  if (food) { ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(food[0]*CELL+CELL/2, food[1]*CELL+CELL/2, CELL/3, 0, 7); ctx.fill(); }
  snake.forEach((s, i) => { ctx.fillStyle = i ? '#2fbf9f' : '#e8fff8'; ctx.fillRect(s[0]*CELL+2, s[1]*CELL+2, CELL-4, CELL-4); });
}
cv.addEventListener('click', e => {
  if (over) return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * N), y = Math.floor((e.clientY - r.top) / r.height * N);
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  if (snake.some(s => s[0] === x && s[1] === y)) return;
  if (mode === 'food') { if (!walls.has(key(x, y))) food = [x, y]; }
  else {
    if (walls.has(key(x, y))) { walls.delete(key(x, y)); ink++; }
    else if (ink > 0 && !(food && food[0] === x && food[1] === y)) { walls.add(key(x, y)); ink--; }
  }
  hud(); draw();
});
$('mFood').onclick = () => setMode('food');
$('mWall').onclick = () => setMode('wall');
$('restart').onclick = reset;
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'resume' : 'pause'; };
setInterval(step, 260);
reset();
