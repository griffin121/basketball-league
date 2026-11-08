'use strict';
const KEY = 'hoops-league-v1';
const STATS = [['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['tpm','3PM']];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);

let state = blank();
let tab = 'standings';
let sort = { key: 'pts', dir: -1 };
let published = "";   // JSON string of what is live, to detect unpublished changes
let creds = null;      // {salt, iter, hash} from admin.json
let admin = false;
try { admin = sessionStorage.getItem('hoops-admin') === '1'; } catch {}
// Everyone sees the published data.json. Only a logged-in admin can edit; edits are kept as a
// local draft in the admin's browser until they export it and upload data.json to the repo.
const A = html => admin ? html : '';

function blank() { return { league: 'My Basketball League', teams: [], players: [], games: [] }; }
function save() { if (!admin) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} render(); if (isDirty()) toast('Saved as a draft. Press Publish to make it live.'); }

const hex2buf = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const buf2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function pwHash(pw, c) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return buf2hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hex2buf(c.salt), iterations: c.iter, hash: 'SHA-256' }, k, 256));
}
function adminClick() {
  if (admin) { admin = false; try { sessionStorage.removeItem('hoops-admin'); } catch {} location.reload(); return; }
  if (!creds) return alert('Admin password has not been set up yet.');
  dialog(`<h2>Admin login</h2><label>Password</label><input type="password" name="pw" autocomplete="current-password" required autofocus>
    <div class="actions"><button type="button" class="g" data-cancel>Cancel</button><button class="b">Log in</button></div>`, async fd => {
    let ok = false;
    try { ok = (await pwHash(fd.get('pw'), creds)) === creds.hash; } catch {}
    if (!ok) return alert('Wrong password.');
    admin = true; try { sessionStorage.setItem('hoops-admin', '1'); } catch {}
    loadDraft(); loadKeeper(); render();
  });
}
function loadDraft() {
  try { const d = localStorage.getItem(KEY); if (d) state = Object.assign(blank(), JSON.parse(d)); } catch {}
}

const team = id => state.teams.find(t => t.id === id);
const player = id => state.players.find(p => p.id === id);
const tname = id => team(id)?.name ?? '?';
const tdot = id => `<span class="dot" style="background:${esc(team(id)?.color || '#999')}"></span>`;

/* ---------- computed ---------- */
function standings() {
  const rows = Object.fromEntries(state.teams.map(t => [t.id, { t, w: 0, l: 0, pf: 0, pa: 0, form: [] }]));
  const played = state.games.filter(g => g.played).sort((a, b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')));
  for (const g of played) {
    const h = rows[g.homeId], a = rows[g.awayId];
    if (!h || !a) continue;
    h.pf += g.homeScore; h.pa += g.awayScore; a.pf += g.awayScore; a.pa += g.homeScore;
    const hw = g.homeScore > g.awayScore;
    (hw ? h : a).w++; (hw ? a : h).l++;
    h.form.push(hw ? 'W' : 'L'); a.form.push(hw ? 'L' : 'W');
  }
  return Object.values(rows).map(r => ({ ...r, gp: r.w + r.l, pct: r.w + r.l ? r.w / (r.w + r.l) : 0, diff: r.pf - r.pa }))
    .sort((x, y) => y.pct - x.pct || y.diff - x.diff || y.pf - x.pf);
}
function playerTotals() {
  const m = {};
  for (const g of state.games) if (g.played) for (const [pid, s] of Object.entries(g.stats || {})) {
    const p = player(pid); if (!p) continue;
    const r = m[pid] ??= { p, gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };
    r.gp++; for (const [k] of STATS) r[k] += +s[k] || 0;
  }
  return Object.values(m);
}

/* ---------- views ---------- */
function render() {
  if (!admin && (tab === 'data' || tab === 'keeper')) tab = 'standings';
  $('#draftbar').innerHTML = draftBanner();
  document.body.classList.toggle('has-bar', isDirty());
  $('#leagueName').textContent = state.league;
  $('#adminBtn').textContent = admin ? 'Admin ✓ Log out' : 'Admin login';
  document.querySelectorAll('#tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === 'data' || b.dataset.tab === 'keeper') b.hidden = !admin;
  });
  $('#view').innerHTML = ({ standings: vStandings, schedule: vSchedule, teams: vTeams, stats: vStats, keeper: vKeeper, data: vData })[tab]();
}

function vStandings() {
  if (!state.teams.length) return empty('Add teams on the Teams tab to get started.');
  const rows = standings().map((r, i) => `<tr><td>${i + 1}. ${tdot(r.t.id)}${esc(r.t.name)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td>
    <td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td>${r.form.slice(-5).join(' ')}</td></tr>`).join('');
  return `<div class="card"><div class="row"><h2>Standings</h2></div><table><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PCT</th><th>PF</th><th>PA</th><th>DIFF</th><th>Last 5</th></tr>${rows}</table></div>`;
}

const fmtDate = d => { try { return new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); } catch { return d; } };
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':'); const hr = +h % 12 || 12; return `${hr}:${m} ${+h < 12 ? 'AM' : 'PM'}`; };

function boxHtml(g) {
  const sides = [g.awayId, g.homeId].map(tid => {
    const rows = state.players.filter(p => p.teamId === tid && g.stats?.[p.id]).map(p => {
      const s = g.stats[p.id];
      return `<tr><td class="l">${esc(p.name)}</td>${STATS.map(([k]) => `<td>${s[k] ?? '–'}</td>`).join('')}</tr>`;
    }).join('');
    return rows ? `<div style="margin-top:10px"><strong>${tdot(tid)}${esc(tname(tid))}</strong>
      <table><tr><th class="l">Player</th>${STATS.map(([, l]) => `<th>${l}</th>`).join('')}</tr>${rows}</table></div>` : '';
  }).join('');
  return sides ? `<details class="box-detail"><summary>Box score</summary>${sides}</details>` : '';
}

function gameRow(g) {
  const aw = g.played && g.awayScore > g.homeScore, hw = g.played && g.homeScore > g.awayScore;
  const side = (id, score, win) => `<div class="side ${win ? 'win' : ''}">${tdot(id)}<span class="nm">${esc(tname(id))}</span>${g.played ? `<span class="pts">${score}</span>` : ''}</div>`;
  const meta = [g.played ? 'Final' : fmtTime(g.time), g.location].filter(Boolean).map(esc).join(' · ');
  return `<div class="gm">
    <div class="gm-main">${g.played ? `<div class="sides">${side(g.awayId, g.awayScore, aw)}${side(g.homeId, g.homeScore, hw)}</div>`
      : `<div class="sides matchup">${tdot(g.awayId)}<strong>${esc(tname(g.awayId))}</strong><span class="vs">vs</span>${tdot(g.homeId)}<strong>${esc(tname(g.homeId))}</strong></div>`}
      <div class="gm-side">${meta ? `<span class="muted">${meta}</span>` : ''}${A(`<button class="g" onclick="editGame('${g.id}')">${g.played ? 'Edit' : 'Enter score'}</button>`)}</div></div>
    ${g.played ? boxHtml(g) : ''}</div>`;
}

function vSchedule() {
  const key = g => g.date + (g.time || '');
  const all = [...state.games].sort((a, b) => key(a).localeCompare(key(b)));
  const weekOf = Object.fromEntries([...new Set(all.map(g => g.date))].map((d, i) => [d, i + 1]));
  const byDate = list => {
    const m = new Map(); for (const g of list) { if (!m.has(g.date)) m.set(g.date, []); m.get(g.date).push(g); }
    return [...m.entries()];
  };
  const banner = ([date, games], badge) => `<div class="card day">
    <div class="day-head"><div><strong>${esc(fmtDate(date))}</strong> <span class="muted">· Week ${weekOf[date]}</span></div>${badge ? `<span class="badge">${badge}</span>` : ''}</div>
    ${games.map(gameRow).join('')}</div>`;
  const up = byDate(all.filter(g => !g.played)), done = byDate(all.filter(g => g.played).reverse());
  return `<div class="row"><h2>Upcoming</h2>${A('<button class="b" onclick="editGame()">+ Game</button>')}</div>
    ${up.map((d, i) => banner(d, i === 0 ? 'Next up' : '')).join('') || '<div class="card muted">No upcoming games.</div>'}
    <div class="row" style="margin-top:22px"><h2>Results</h2></div>
    ${done.map(d => banner(d)).join('') || '<div class="card muted">No results yet.</div>'}`;
}

function vTeams() {
  const cards = state.teams.map(t => {
    const ps = state.players.filter(p => p.teamId === t.id);
    return `<div class="card"><div class="row"><h2>${tdot(t.id)}${esc(t.name)}</h2>${A(`<span>
      <button class="g" onclick="editPlayer(null,'${t.id}')">+ Player</button> <button class="g" onclick="editTeam('${t.id}')">Edit</button></span>`)}</div>
      <table><tr><th>#</th><th class="l">Player</th><th></th></tr>${ps.map(p => `<tr><td>${esc(p.number)}</td><td class="l">${esc(p.name)}</td><td>${A(`<button class="g" onclick="editPlayer('${p.id}')">Edit</button>`)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No players</td></tr>'}</table></div>`;
  }).join('');
  return `<div class="row"><h2>Teams</h2>${A('<button class="b" onclick="editTeam()">+ Team</button>')}</div>${cards || empty('No teams yet.')}`;
}

function vStats() {
  const rows = playerTotals().map(r => ({ ...r, ...Object.fromEntries(STATS.map(([k]) => [k + 'pg', r[k] / r.gp])) }));
  const key = sort.key;
  rows.sort((a, b) => ((b[key] ?? 0) - (a[key] ?? 0)) * -sort.dir || a.p.name.localeCompare(b.p.name));
  const th = (k, label) => `<th class="sort" onclick="setSort('${k}')">${label}${sort.key === k ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const body = rows.map(r => `<tr><td>${tdot(r.p.teamId)}${esc(r.p.name)} <span class="muted">${esc(tname(r.p.teamId))}</span></td><td>${r.gp}</td>
    ${STATS.map(([k]) => `<td>${r[k + 'pg'].toFixed(1)}</td>`).join('')}${STATS.map(([k]) => `<td class="muted">${r[k]}</td>`).join('')}</tr>`).join('');
  if (!rows.length) return empty('Enter box-score stats when scoring a game and they will show up here.');
  return `<div class="card"><div class="row"><h2>Player Stats</h2><span class="muted">tap a column to sort</span></div><table><tr><th>Player</th>${th('gp', 'GP')}
    ${STATS.map(([k, l]) => th(k + 'pg', l + '/G')).join('')}${STATS.map(([k, l]) => th(k, l)).join('')}</tr>${body}</table></div>`;
}

function vData() {
  if (!admin) return empty('Admin only.');
  return `<div class="card"><h2>League</h2><label>League name</label><input value="${esc(state.league)}" onchange="state.league=this.value;save()">
    <p class="muted">Edits are a draft in this browser until you press <b>Publish to site</b>, which saves them to GitHub so everyone sees them (the live site updates about a minute later).</p>
    <div class="actions" style="justify-content:flex-start"><button class="b" onclick="publish()">Publish to site</button> <button class="g" onclick="exportData()">Export JSON</button>
    <button class="g" onclick="$('#imp').click()">Import JSON</button><input id="imp" type="file" accept=".json" hidden onchange="importData(this.files[0])">
    <button class="g" onclick="forgetToken()">Remove saved token</button>
    <button class="g d" onclick="if(confirm('Discard your draft and reload the published data?')){localStorage.removeItem(KEY);location.reload()}">Discard draft</button></div></div>`;
}
const empty = msg => `<div class="card muted">${msg}</div>`;

/* ---------- dialogs ---------- */
function dialog(html, onSubmit) {
  const f = $('#dlgForm'); f.innerHTML = html;
  f.onsubmit = e => { e.preventDefault(); onSubmit(new FormData(f)); $('#dlg').close(); };
  f.querySelector('[data-cancel]').onclick = () => $('#dlg').close();
  $('#dlg').showModal();
}
const btns = del => `<div class="actions">${del ? `<button type="button" class="g d" data-del style="margin-right:auto">Delete</button>` : ''}<button type="button" class="g" data-cancel>Cancel</button><button class="b">Save</button></div>`;
function hookDelete(fn) { const d = $('#dlgForm [data-del]'); if (d) d.onclick = () => { if (confirm('Delete?')) { fn(); $('#dlg').close(); } }; }

function editTeam(id) {
  if (!admin) return;
  const t = team(id) || { name: '', color: '#e8590c' };
  dialog(`<h2>${id ? 'Edit' : 'New'} team</h2><label>Name</label><input name="name" required value="${esc(t.name)}"><label>Color</label><input name="color" type="color" value="${esc(t.color)}">${btns(id)}`, fd => {
    if (id) Object.assign(t, { name: fd.get('name'), color: fd.get('color') });
    else state.teams.push({ id: uid(), name: fd.get('name'), color: fd.get('color') });
    save();
  });
  hookDelete(() => {
    state.teams = state.teams.filter(x => x.id !== id);
    state.players = state.players.filter(p => p.teamId !== id);
    state.games = state.games.filter(g => g.homeId !== id && g.awayId !== id); save();
  });
}
function editPlayer(id, teamId) {
  if (!admin) return;
  const p = player(id) || { name: '', number: '', teamId };
  dialog(`<h2>${id ? 'Edit' : 'New'} player</h2><div class="two"><div><label>Name</label><input name="name" required value="${esc(p.name)}"></div><div><label>Number</label><input name="number" value="${esc(p.number)}"></div></div>
    <label>Team</label><select name="team">${state.teams.map(t => `<option value="${t.id}" ${t.id === p.teamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>${btns(id)}`, fd => {
    const v = { name: fd.get('name'), number: fd.get('number'), teamId: fd.get('team') };
    if (id) Object.assign(p, v); else state.players.push({ id: uid(), ...v });
    save();
  });
  hookDelete(() => { state.players = state.players.filter(x => x.id !== id); save(); });
}
function editGame(id) {
  if (!admin) return;
  if (state.teams.length < 2) return alert('Add at least two teams first.');
  const g = state.games.find(x => x.id === id) || { date: new Date().toISOString().slice(0, 10), time: '', homeId: state.teams[0].id, awayId: state.teams[1].id, location: '', played: false, homeScore: 0, awayScore: 0, stats: {} };
  const opts = sel => state.teams.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const box = tid => {
    const ps = state.players.filter(p => p.teamId === tid);
    return `<h2 style="margin-top:12px">${esc(tname(tid))} box score</h2><div style="overflow-x:auto"><table class="box"><tr><th>Player</th>${STATS.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
      ${ps.map(p => `<tr><td>${esc(p.number)} ${esc(p.name)}</td>${STATS.map(([k]) => `<td><input type="number" min="0" name="s_${p.id}_${k}" value="${g.stats?.[p.id]?.[k] ?? ''}"></td>`).join('')}</tr>`).join('') || '<tr><td class="muted">No players</td></tr>'}</table></div>`;
  };
  dialog(`<h2>${id ? 'Edit' : 'New'} game</h2><div class="two"><div><label>Date</label><input type="date" name="date" required value="${esc(g.date)}"></div><div><label>Time</label><input type="time" name="time" value="${esc(g.time)}"></div>
    <div><label>Away</label><select name="away">${opts(g.awayId)}</select></div><div><label>Home</label><select name="home">${opts(g.homeId)}</select></div></div>
    <label>Location</label><input name="location" value="${esc(g.location)}">
    <label><input type="checkbox" name="played" style="width:auto" ${g.played ? 'checked' : ''}> Game played (final score)</label>
    <div class="two"><div><label>Away score</label><input type="number" min="0" name="as" value="${g.awayScore}"></div><div><label>Home score</label><input type="number" min="0" name="hs" value="${g.homeScore}"></div></div>
    <details ${g.played ? 'open' : ''}><summary class="muted" style="margin-top:10px;cursor:pointer">Box score (optional; save after changing teams to refresh)</summary>${box(g.awayId)}${box(g.homeId)}</details>${btns(id)}`, fd => {
    if (fd.get('home') === fd.get('away')) return alert('Teams must differ.');
    const stats = {};
    for (const [k, v] of fd.entries()) {
      const m = k.match(/^s_(.+)_(\w+)$/); if (!m || v === '') continue;
      (stats[m[1]] ??= {})[m[2]] = +v;
    }
    Object.assign(g, { date: fd.get('date'), time: fd.get('time'), awayId: fd.get('away'), homeId: fd.get('home'), location: fd.get('location'),
      played: fd.has('played'), awayScore: +fd.get('as') || 0, homeScore: +fd.get('hs') || 0, stats });
    if (!id) state.games.push({ id: uid(), ...g });
    save();
  });
  hookDelete(() => { state.games = state.games.filter(x => x.id !== id); save(); });
}

/* ---------- misc ---------- */
function setSort(k) { sort = { key: k, dir: sort.key === k ? -sort.dir : -1 }; render(); }
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'data.json'; a.click();
}
function importData(file) {
  if (!admin || !file) return;
  file.text().then(t => { state = Object.assign(blank(), JSON.parse(t)); save(); }).catch(() => alert('Invalid file.'));
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });


/* ---------- publishing (saves data.json to the GitHub repo) ---------- */
const GH = { repo: "griffin121/basketball-league", path: "data.json", branch: "main" };
const TOKEN_KEY = "hoops-gh-token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
function forgetToken() { try { localStorage.removeItem(TOKEN_KEY); } catch {} toast("Token removed from this browser."); }
const isDirty = () => admin && published && JSON.stringify(state) !== published;
function draftBanner() {
  return isDirty() ? `<div class="bar-in"><span><b>Unpublished changes</b> \u2013 visitors can\u2019t see them yet.</span>
    <span><button class="b" onclick="publish()">Publish to site</button> <button class="g" onclick="discardDraft()">Discard</button></span></div>` : "";
}
function discardDraft() { if (confirm("Discard your unpublished changes?")) { try { localStorage.removeItem(KEY); } catch {} location.reload(); } }
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 6000);
}
function askToken() {
  return new Promise(resolve => {
    dialog(`<h2>One-time setup: GitHub token</h2>
      <p class="muted">Publishing saves <code>data.json</code> to your repo, which needs a GitHub token. It is stored only in this browser.</p>
      <ol class="muted" style="padding-left:18px"><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → new fine-grained token</a>.</li>
      <li>Repository access: <b>Only select repositories</b> → basketball-league.</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b>.</li><li>Generate, copy, and paste it below.</li></ol>
      <label>Token</label><input type="password" name="tok" autocomplete="off" required>
      <div class="actions"><button type="button" class="g" data-cancel>Cancel</button><button class="b">Save token</button></div>`, fd => {
      const v = String(fd.get("tok") || "").trim();
      if (v) { try { localStorage.setItem(TOKEN_KEY, v); } catch { return alert("Could not store the token in this browser."); } }
      resolve(v);
    });
    $("#dlg").addEventListener("close", () => resolve(""), { once: true });
  });
}
async function publish() {
  if (!admin) return;
  let token = getToken() || await askToken();
  if (!token) return;
  const api = `https://api.github.com/repos/${GH.repo}/contents/${GH.path}`;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
  try {
    toast("Publishing\u2026");
    const cur = await fetch(api + "?ref=" + GH.branch, { headers, cache: "no-store" });
    if (cur.status === 401 || cur.status === 403) { forgetToken(); return toast("GitHub rejected the token. Try Publish again to enter a new one."); }
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const body = JSON.stringify(state, null, 2);
    const res = await fetch(api, { method: "PUT", headers, body: JSON.stringify({
      message: "Update league data", branch: GH.branch, sha,
      content: btoa(unescape(encodeURIComponent(body))) }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.status);
    published = JSON.stringify(state);
    try { localStorage.removeItem(KEY); } catch {}
    render(); toast("Published! The live site updates in about a minute.");
  } catch (e) { toast("Publish failed: " + e.message); }
}

/* ---------- live score keeper (admin) ---------- */
const KK = 'hoops-keeper-v1';
const freshK = () => ({ gameId: '', on: {}, seen: [], events: [], sel: null });
let K = freshK();
function loadKeeper() {
  try { const d = JSON.parse(localStorage.getItem(KK)); if (d) K = Object.assign(freshK(), d); } catch {}
  if (K.gameId && !state.games.some(g => g.id === K.gameId)) K = freshK();
}
function saveKeeper() { try { localStorage.setItem(KK, JSON.stringify(K)); } catch {} }
const kGame = () => state.games.find(g => g.id === K.gameId);
const kRoster = tid => state.players.filter(p => p.teamId === tid);
const kOn = tid => (K.on[tid] ??= []);
const zero = () => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 });
const EV = { '2': '2-pointer', '3': '3-pointer', reb: 'Rebound', blk: 'Block', stl: 'Steal' };

function kTotals() {
  const st = {}, team = {};
  for (const e of K.events) {
    const s = (st[e.p] ??= zero());
    if (e.t === '2' || e.t === '3') {
      s.pts += +e.t; if (e.t === '3') s.tpm++;
      team[e.team] = (team[e.team] || 0) + +e.t;
      if (e.a) (st[e.a] ??= zero()).ast++;
    } else s[e.t]++;
  }
  return { st, team };
}

function vKeeper() {
  if (!admin) return empty('Admin only.');
  const g = kGame();
  const label = x => `${fmtDate(x.date).replace(/^\w+ /, '')} — ${tname(x.awayId)} vs ${tname(x.homeId)}${x.played ? ' (final)' : ''}`;
  const games = [...state.games].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  let html = `<div class="card"><div class="row"><h2>Score Keeper</h2></div><label>Game</label>
    <select onchange="kPick(this.value)"><option value="">Select a game…</option>${games.map(x => `<option value="${x.id}" ${x.id === K.gameId ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}</select></div>`;
  if (!g) return html;
  const { st, team } = kTotals();
  const col = tid => {
    const on = kOn(tid), bench = kRoster(tid).filter(p => !on.includes(p.id));
    const tile = pid => {
      const p = player(pid), s = st[pid] || zero();
      return `<div class="tile ${K.sel === pid ? 'sel' : ''}" onclick="kSelect('${pid}')"><button class="x" title="Take out" onclick="event.stopPropagation();kOut('${tid}','${pid}')">×</button>
        <b>${esc(p?.name)}</b><span class="muted">${s.pts} pts · ${s.reb} reb · ${s.ast} ast</span><span class="muted">${s.stl} stl · ${s.blk} blk</span></div>`;
    };
    return `<div class="card kcol"><div class="kscore">${tdot(tid)}<span>${esc(tname(tid))}</span><b>${team[tid] || 0}</b></div>
      <div class="muted" style="margin:6px 0">On court ${on.length}/4 — tap a player to select</div>
      <div class="tiles">${on.map(tile).join('') || '<span class="muted">Nobody on court yet. Add players below.</span>'}</div>
      <div class="muted" style="margin:10px 0 4px">Bench — tap to sub in</div>
      <div class="chips">${bench.map(p => `<button class="g chip" onclick="kIn('${tid}','${p.id}')">${esc(p.name)}</button>`).join('') || '<span class="muted">Everyone is on court.</span>'}</div></div>`;
  };
  const sel = K.sel && player(K.sel);
  const dis = sel ? '' : 'disabled';
  const recent = [...K.events].reverse().slice(0, 8).map(e => {
    const a = e.a ? ` (assist: ${esc(player(e.a)?.name)})` : '';
    return `<div>${tdot(e.team)}<b>${esc(player(e.p)?.name)}</b> – ${EV[e.t]}${a}</div>`;
  }).join('') || '<span class="muted">No plays yet.</span>';
  html += `<div class="kgrid">${col(g.awayId)}${col(g.homeId)}</div>
    <div class="card kactions"><div class="muted" style="margin-bottom:8px">${sel ? `Selected: <b>${esc(sel.name)}</b>` : 'Select a player on court, then tap an action.'}</div>
      <div class="abtns"><button class="b" ${dis} onclick="kAct('2')">2 Pointer</button><button class="b" ${dis} onclick="kAct('3')">3 Pointer</button>
      <button class="b" ${dis} onclick="kAct('reb')">Rebound</button><button class="b" ${dis} onclick="kAct('blk')">Block</button><button class="b" ${dis} onclick="kAct('stl')">Steal</button>
      <button class="g" ${K.events.length ? '' : 'disabled'} onclick="kUndo()">↶ Undo</button></div></div>
    <div class="card"><div class="row"><h2>Recent plays</h2><span><button class="b" onclick="kFinish()" ${K.events.length ? '' : 'disabled'}>Save to game</button>
      <button class="g d" onclick="kReset()">Clear</button></span></div>${recent}</div>`;
  return html;
}

function kPick(id) {
  if (!admin) return;
  if (id === K.gameId) return;
  if (K.events.length && !confirm('Switch games? Unsaved plays for the current game will be lost.')) return render();
  K = freshK(); K.gameId = id; saveKeeper(); render();
  const g = kGame(); if (g?.played && Object.keys(g.stats || {}).length) toast('This game already has stats. Saving will replace them.');
}
function kSelect(pid) { K.sel = K.sel === pid ? null : pid; saveKeeper(); render(); }
function kMarkSeen(pid) { if (!K.seen.includes(pid)) K.seen.push(pid); }
function kIn(tid, pid) {
  const on = kOn(tid);
  if (on.length < 4) { on.push(pid); kMarkSeen(pid); saveKeeper(); return render(); }
  // full: ask who to replace
  const f = $('#dlgForm');
  f.innerHTML = `<h2>Sub in ${esc(player(pid)?.name)} for…</h2><div class="tiles">${on.map(o => `<button type="button" class="g chip" onclick="kSwap('${tid}','${o}','${pid}')">${esc(player(o)?.name)}</button>`).join('')}</div>
    <div class="actions"><button type="button" class="g" onclick="$('#dlg').close()">Cancel</button></div>`;
  f.onsubmit = e => e.preventDefault(); $('#dlg').showModal();
}
function kSwap(tid, out, inn) {
  K.on[tid] = kOn(tid).map(x => x === out ? inn : x); kMarkSeen(inn);
  if (K.sel === out) K.sel = null;
  $('#dlg').close(); saveKeeper(); render();
}
function kOut(tid, pid) { K.on[tid] = kOn(tid).filter(x => x !== pid); if (K.sel === pid) K.sel = null; saveKeeper(); render(); }
function kAct(t) {
  if (!admin) return;
  const p = player(K.sel); if (!p) return;
  const ev = { t, p: p.id, team: p.teamId };
  if (t !== '2' && t !== '3') { K.events.push(ev); K.sel = null; saveKeeper(); return render(); }
  const mates = kOn(p.teamId).filter(x => x !== p.id);
  const f = $('#dlgForm');
  f.innerHTML = `<h2>${esc(p.name)} – ${EV[t]}. Assist?</h2><div class="tiles">${mates.map(m => `<button type="button" class="b chip" onclick="kShot('${t}','${p.id}','${m}')">${esc(player(m)?.name)}</button>`).join('')}
    <button type="button" class="g chip" onclick="kShot('${t}','${p.id}','')">No assist</button></div>
    <div class="actions"><button type="button" class="g" onclick="$('#dlg').close()">Cancel</button></div>`;
  f.onsubmit = e => e.preventDefault(); $('#dlg').showModal();
}
function kShot(t, pid, aid) {
  const p = player(pid); K.events.push({ t, p: pid, team: p.teamId, ...(aid ? { a: aid } : {}) });
  K.sel = null; $('#dlg').close(); saveKeeper(); render();
}
function kUndo() { if (!K.events.length) return; const e = K.events.pop(); K.sel = null; saveKeeper(); render(); toast('Undid: ' + (player(e.p)?.name || '') + ' ' + EV[e.t]); }
function kReset() { if (confirm('Clear all plays and start over for this game?')) { const id = K.gameId; K = freshK(); K.gameId = id; saveKeeper(); render(); } }
function kFinish() {
  if (!admin) return;
  const g = kGame(); if (!g || !K.events.length) return;
  const { st, team } = kTotals();
  const msg = `Save ${tname(g.awayId)} ${team[g.awayId] || 0} – ${team[g.homeId] || 0} ${tname(g.homeId)} to this game?` + (Object.keys(g.stats || {}).length ? '\nThis replaces the stats already entered for it.' : '');
  if (!confirm(msg)) return;
  const stats = {};
  for (const pid of new Set([...K.seen, ...Object.keys(st)])) stats[pid] = { ...zero(), ...(st[pid] || {}) };
  Object.assign(g, { played: true, awayScore: team[g.awayId] || 0, homeScore: team[g.homeId] || 0, stats });
  K = freshK(); saveKeeper(); save();
}

$('#adminBtn').onclick = adminClick;
(async () => {
  try { const r = await fetch('admin.json', { cache: 'no-cache' }); if (r.ok) creds = await r.json(); } catch {}
  try { const r = await fetch('data.json', { cache: 'no-cache' }); if (r.ok) state = Object.assign(blank(), await r.json()); } catch {}
  published = JSON.stringify(state);
  if (admin) { loadDraft(); loadKeeper(); }
  render();
})();
