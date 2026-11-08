'use strict';
const KEY = 'hoops-league-v1';
const STATS = [['pts','PTS'],['reb','REB'],['ast','AST'],['stl','STL'],['blk','BLK'],['tpm','3PM']];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);

let state = load();
let tab = 'standings';
let sort = { key: 'pts', dir: -1 };

function blank() { return { league: 'My Basketball League', teams: [], players: [], games: [] }; }
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} render(); }

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
  $('#leagueName').textContent = state.league;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#view').innerHTML = ({ standings: vStandings, schedule: vSchedule, teams: vTeams, stats: vStats, data: vData })[tab]();
}

function vStandings() {
  if (!state.teams.length) return empty('Add teams on the Teams tab to get started.');
  const rows = standings().map((r, i) => `<tr><td>${i + 1}. ${tdot(r.t.id)}${esc(r.t.name)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td>
    <td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.pf}</td><td>${r.pa}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td>${r.form.slice(-5).join(' ')}</td></tr>`).join('');
  return `<div class="card"><div class="row"><h2>Standings</h2></div><table><tr><th>Team</th><th>GP</th><th>W</th><th>L</th><th>PCT</th><th>PF</th><th>PA</th><th>DIFF</th><th>Last 5</th></tr>${rows}</table></div>`;
}

function vSchedule() {
  const games = [...state.games].sort((a, b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')));
  const item = g => {
    const hw = g.played && g.homeScore > g.awayScore, aw = g.played && g.awayScore > g.homeScore;
    return `<div class="game"><div class="when muted">${esc(g.date)} ${esc(g.time || '')}</div>
      <div>${tdot(g.awayId)}<span class="${aw ? 'win' : ''}">${esc(tname(g.awayId))}</span> <span class="muted">@</span> ${tdot(g.homeId)}<span class="${hw ? 'win' : ''}">${esc(tname(g.homeId))}</span>
      ${g.location ? `<div class="muted" style="font-size:.8rem">${esc(g.location)}</div>` : ''}</div>
      <div><span class="score">${g.played ? `${g.awayScore} – ${g.homeScore}` : ''}</span> <button class="g" onclick="editGame('${g.id}')">${g.played ? 'Edit' : 'Score'}</button></div></div>`;
  };
  const up = games.filter(g => !g.played), done = games.filter(g => g.played).reverse();
  return `<div class="card"><div class="row"><h2>Upcoming</h2><button class="b" onclick="editGame()">+ Game</button></div>${up.map(item).join('') || '<p class="muted">No upcoming games.</p>'}</div>
    <div class="card"><div class="row"><h2>Results</h2></div>${done.map(item).join('') || '<p class="muted">No results yet.</p>'}</div>`;
}

function vTeams() {
  const cards = state.teams.map(t => {
    const ps = state.players.filter(p => p.teamId === t.id);
    return `<div class="card"><div class="row"><h2>${tdot(t.id)}${esc(t.name)}</h2><span>
      <button class="g" onclick="editPlayer(null,'${t.id}')">+ Player</button> <button class="g" onclick="editTeam('${t.id}')">Edit</button></span></div>
      <table><tr><th>#</th><th class="l">Player</th><th></th></tr>${ps.map(p => `<tr><td>${esc(p.number)}</td><td class="l">${esc(p.name)}</td><td><button class="g" onclick="editPlayer('${p.id}')">Edit</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No players</td></tr>'}</table></div>`;
  }).join('');
  return `<div class="row"><h2>Teams</h2><button class="b" onclick="editTeam()">+ Team</button></div>${cards || empty('No teams yet.')}`;
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
  return `<div class="card"><h2>League</h2><label>League name</label><input value="${esc(state.league)}" onchange="state.league=this.value;save()">
    <p class="muted">Data is saved in this browser. Export a backup regularly, or commit the exported file as <code>data.json</code> to publish it for everyone.</p>
    <div class="actions" style="justify-content:flex-start"><button class="b" onclick="exportData()">Export JSON</button>
    <button class="g" onclick="$('#imp').click()">Import JSON</button><input id="imp" type="file" accept=".json" hidden onchange="importData(this.files[0])">
    <button class="g d" onclick="if(confirm('Erase everything?')){state=blank();save()}">Reset</button></div></div>`;
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
  if (!file) return;
  file.text().then(t => { state = Object.assign(blank(), JSON.parse(t)); save(); }).catch(() => alert('Invalid file.'));
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });

// First visit with no local data: try a published data.json (so visitors see the shared league)
(async () => {
  if (!localStorage.getItem(KEY)) {
    try { const r = await fetch('data.json'); if (r.ok) state = Object.assign(blank(), await r.json()); } catch {}
  }
  render();
})();
