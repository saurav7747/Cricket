/* ============================================================
   SAURAVSCORE — app.js
   Complete Cricket Scoring Engine
   Developer: Saurav Kumar
   ============================================================ */

'use strict';

// ── Service Worker ──────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./service-worker.js').catch(() => {})
  );
}

// ── State ───────────────────────────────────────────────────
const STATE = {
  match: null,
  currentPage: 'dash'
};

const DEFAULT_MATCH = () => ({
  id: Date.now().toString(),
  createdAt: new Date().toISOString(),
  teamA: '', teamB: '',
  totalOvers: 20,
  tossWinner: '',
  tossElected: 'bat',
  battingFirst: '',
  bowlingFirst: '',
  playersA: [],
  playersB: [],
  innings: [
    createInnings(), // 1st innings
    createInnings()  // 2nd innings
  ],
  currentInnings: 0,
  status: 'live', // live | result
  result: null,
  winnerTeam: '',
  winnerMargin: ''
});

function createInnings() {
  return {
    battingTeam: '',
    bowlingTeam: '',
    runs: 0,
    wickets: 0,
    balls: 0, // legal balls only
    extras: { wides: 0, noBalls: 0 },
    batsmen: {},
    bowlers: {},
    onStrikeBatsman: null,
    nonStrikeBatsman: null,
    currentBowler: null,
    ballHistory: [],
    currentOverBalls: [],
    completed: false
  };
}

function createBatsman(name) {
  return { name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
}

function createBowler(name) {
  return { name, overs: 0, ballsThisOver: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
}

// ── Getters ─────────────────────────────────────────────────
const getInnings = () => STATE.match.innings[STATE.match.currentInnings];
const isFirstInnings = () => STATE.match.currentInnings === 0;

function oversDisplay(balls) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

function calcCRR(runs, balls) {
  if (balls === 0) return '0.00';
  return ((runs / balls) * 6).toFixed(2);
}

function calcSR(runs, balls) {
  if (balls === 0) return '0.00';
  return ((runs / balls) * 100).toFixed(1);
}

function calcEcon(runs, overs, balls) {
  const total = overs * 6 + balls;
  if (total === 0) return '0.00';
  return ((runs / total) * 6).toFixed(2);
}

// ── Local Storage ────────────────────────────────────────────
function saveHistory(match) {
  try {
    const raw = localStorage.getItem('sauravscore_history');
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(m => m.id === match.id);
    if (idx >= 0) list[idx] = match;
    else list.unshift(match);
    localStorage.setItem('sauravscore_history', JSON.stringify(list.slice(0, 30)));
  } catch(e) {}
}

function getHistory() {
  try {
    const raw = localStorage.getItem('sauravscore_history');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function clearHistory() {
  try { localStorage.removeItem('sauravscore_history'); } catch(e) {}
}

function autoSave() {
  if (STATE.match) saveHistory(STATE.match);
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Page Navigation ──────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  STATE.currentPage = pageId;
}

// ── Modals ───────────────────────────────────────────────────
function showModal(id) { document.getElementById('modal-' + id).style.display = ''; }
function hideModal(id) { document.getElementById('modal-' + id).style.display = 'none'; }

// ── Splash ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  setTimeout(() => {
    app.classList.add('active');
    renderDashboard();
  }, 1200); // matches animation duration

  initInstall();
  initOffline();
  initFormLogic();
  initScoringButtons();
  initNavButtons();
  initModals();
});

// ── Offline ──────────────────────────────────────────────────
function initOffline() {
  const banner = document.getElementById('offline-banner');
  function update() {
    banner.classList.toggle('show', !navigator.onLine);
  }
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

// ── Install ──────────────────────────────────────────────────
let deferredInstall;
function initInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    document.getElementById('install-banner').classList.add('show');
  });
  document.getElementById('btn-install').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice.outcome === 'accepted') {
      document.getElementById('install-banner').classList.remove('show');
      deferredInstall = null;
    }
  });
  document.getElementById('btn-dismiss-install').addEventListener('click', () => {
    document.getElementById('install-banner').classList.remove('show');
  });
  window.addEventListener('appinstalled', () => {
    document.getElementById('install-banner').classList.remove('show');
    deferredInstall = null;
  });
}

// ── Nav Buttons ──────────────────────────────────────────────
function initNavButtons() {
  document.getElementById('btn-new-match').addEventListener('click', () => openCreateMatch());
  document.getElementById('btn-history').addEventListener('click', () => openHistory());
  document.getElementById('btn-nav-history').addEventListener('click', () => openHistory());
  document.getElementById('btn-back-create').addEventListener('click', () => showPage('dash'));
  document.getElementById('btn-back-score').addEventListener('click', () => {
    if (confirm('Leave scoring? Match is auto-saved.')) showPage('dash');
  });
  document.getElementById('btn-back-history').addEventListener('click', () => showPage('dash'));
  document.getElementById('btn-back-scorecard').addEventListener('click', () => {
    if (STATE._fromResult) { showPage('result'); STATE._fromResult = false; }
    else showPage('history');
  });
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm('Clear all match history?')) { clearHistory(); renderHistory(); }
  });
  document.getElementById('btn-new-from-result').addEventListener('click', () => openCreateMatch());
  document.getElementById('btn-view-scorecard').addEventListener('click', () => {
    STATE._fromResult = true;
    renderScorecardPage(STATE.match);
    showPage('scorecard');
  });
  document.getElementById('btn-export-detail').addEventListener('click', () => {
    if (STATE._scorecardMatch) exportMatch(STATE._scorecardMatch);
  });
  document.getElementById('btn-score-menu').addEventListener('click', () => showModal('options'));
}

// ── Dashboard ────────────────────────────────────────────────
function renderDashboard() {
  const list = getHistory().slice(0, 3);
  const section = document.getElementById('dash-recent-section');
  const container = document.getElementById('dash-recent-list');
  if (list.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';
  container.innerHTML = list.map(m => `
    <div class="history-item" data-id="${m.id}" style="border-bottom:1px solid var(--border);">
      <div class="history-teams">
        <div class="teams">${esc(m.teamA)} vs ${esc(m.teamB)}</div>
        <div class="result-line">${esc(m.winnerMargin || 'In Progress')}</div>
      </div>
      <div class="history-date">${formatDate(m.createdAt)}</div>
      <div class="history-arrow">›</div>
    </div>
  `).join('');
  container.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const m = getHistory().find(x => x.id === el.dataset.id);
      if (m) { STATE._scorecardMatch = m; renderScorecardPage(m); showPage('scorecard'); }
    });
  });
}

// ── Create Match Form ─────────────────────────────────────────
let playersA = [], playersB = [], tossElected = 'bat';

function openCreateMatch() {
  playersA = []; playersB = []; tossElected = 'bat';
  document.getElementById('inp-team-a').value = '';
  document.getElementById('inp-team-b').value = '';
  document.getElementById('inp-overs').value = '20';
  document.getElementById('sel-toss').innerHTML = '<option value="">Select team…</option>';
  document.getElementById('tog-bat').classList.add('active');
  document.getElementById('tog-bowl').classList.remove('active');
  renderPlayerList('a', []);
  renderPlayerList('b', []);
  ['team-a','team-b','overs','toss','players-a','players-b'].forEach(k => {
    document.getElementById('err-'+k).classList.remove('show');
    const inp = document.getElementById('inp-'+k);
    if (inp) inp.classList.remove('error');
  });
  showPage('create');
}

function initFormLogic() {
  const inpA = document.getElementById('inp-team-a');
  const inpB = document.getElementById('inp-team-b');
  const sel = document.getElementById('sel-toss');

  function updateTossOptions() {
    const a = inpA.value.trim() || 'Team A';
    const b = inpB.value.trim() || 'Team B';
    const cur = sel.value;
    sel.innerHTML = `<option value="">Select team…</option>
      <option value="a" ${cur==='a'?'selected':''}}>${esc(a)}</option>
      <option value="b" ${cur==='b'?'selected':''}}>${esc(b)}</option>`;
    document.getElementById('label-team-a-xi').textContent = `(${a})`;
    document.getElementById('label-team-b-xi').textContent = `(${b})`;
  }
  inpA.addEventListener('input', updateTossOptions);
  inpB.addEventListener('input', updateTossOptions);

  // Toggle bat/bowl
  document.getElementById('tog-bat').addEventListener('click', () => {
    tossElected = 'bat';
    document.getElementById('tog-bat').classList.add('active');
    document.getElementById('tog-bowl').classList.remove('active');
  });
  document.getElementById('tog-bowl').addEventListener('click', () => {
    tossElected = 'bowl';
    document.getElementById('tog-bowl').classList.add('active');
    document.getElementById('tog-bat').classList.remove('active');
  });

  // Players
  document.getElementById('btn-add-player-a').addEventListener('click', () => addPlayer('a'));
  document.getElementById('inp-player-a').addEventListener('keydown', e => { if(e.key==='Enter') addPlayer('a'); });
  document.getElementById('btn-add-player-b').addEventListener('click', () => addPlayer('b'));
  document.getElementById('inp-player-b').addEventListener('keydown', e => { if(e.key==='Enter') addPlayer('b'); });

  document.getElementById('btn-start-match').addEventListener('click', startMatch);
}

function addPlayer(team) {
  const inp = document.getElementById(`inp-player-${team}`);
  const name = inp.value.trim();
  if (!name) return;
  if (team === 'a') { if (!playersA.includes(name)) { playersA.push(name); renderPlayerList('a', playersA); } }
  else { if (!playersB.includes(name)) { playersB.push(name); renderPlayerList('b', playersB); } }
  inp.value = '';
  inp.focus();
}

function renderPlayerList(team, players) {
  const el = document.getElementById(`players-${team}-list`);
  el.innerHTML = players.map((p, i) => `
    <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;font-weight:500;">${esc(p)}</span>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:4px 6px;" data-team="${team}" data-idx="${i}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.team === 'a') { playersA.splice(+btn.dataset.idx, 1); renderPlayerList('a', playersA); }
      else { playersB.splice(+btn.dataset.idx, 1); renderPlayerList('b', playersB); }
    });
  });
}

function startMatch() {
  const teamA = document.getElementById('inp-team-a').value.trim();
  const teamB = document.getElementById('inp-team-b').value.trim();
  const overs = parseInt(document.getElementById('inp-overs').value, 10);
  const toss = document.getElementById('sel-toss').value;
  let valid = true;

  function setErr(id, show) {
    document.getElementById('err-'+id).classList.toggle('show', show);
    const inp = document.getElementById('inp-'+id);
    if (inp) inp.classList.toggle('error', show);
  }

  setErr('team-a', !teamA); if (!teamA) valid = false;
  setErr('team-b', !teamB); if (!teamB) valid = false;
  setErr('overs', !overs || overs < 1 || overs > 50); if (!overs || overs < 1 || overs > 50) valid = false;
  setErr('toss', !toss); if (!toss) valid = false;
  document.getElementById('err-players-a').classList.toggle('show', playersA.length < 2);
  document.getElementById('err-players-b').classList.toggle('show', playersB.length < 2);
  if (playersA.length < 2 || playersB.length < 2) valid = false;

  if (!valid) return;

  const match = DEFAULT_MATCH();
  match.teamA = teamA;
  match.teamB = teamB;
  match.totalOvers = overs;
  match.tossWinner = toss === 'a' ? teamA : teamB;
  match.tossElected = tossElected;
  match.playersA = [...playersA];
  match.playersB = [...playersB];

  // Who bats first?
  const tossTeam = toss === 'a' ? 'a' : 'b';
  let battingFirstKey;
  if (tossElected === 'bat') battingFirstKey = tossTeam;
  else battingFirstKey = tossTeam === 'a' ? 'b' : 'a';

  match.battingFirst = battingFirstKey === 'a' ? teamA : teamB;
  match.bowlingFirst = battingFirstKey === 'a' ? teamB : teamA;

  const battingPlayers = battingFirstKey === 'a' ? [...match.playersA] : [...match.playersB];
  const bowlingPlayers = battingFirstKey === 'a' ? [...match.playersB] : [...match.playersA];

  match.innings[0].battingTeam = match.battingFirst;
  match.innings[0].bowlingTeam = match.bowlingFirst;
  match.innings[0]._battingPlayers = battingPlayers;
  match.innings[0]._bowlingPlayers = bowlingPlayers;

  match.innings[1].battingTeam = match.bowlingFirst;
  match.innings[1].bowlingTeam = match.battingFirst;
  match.innings[1]._battingPlayers = bowlingPlayers;
  match.innings[1]._bowlingPlayers = battingPlayers;

  STATE.match = match;
  autoSave();

  // Select opening batsmen & bowler
  openBatsmanPicker('Opening Batsman (Striker)', battingPlayers, name => {
    getInnings().onStrikeBatsman = name;
    getInnings().batsmen[name] = createBatsman(name);
    const remaining = battingPlayers.filter(p => p !== name);
    openBatsmanPicker('Opening Batsman (Non-Striker)', remaining, name2 => {
      getInnings().nonStrikeBatsman = name2;
      getInnings().batsmen[name2] = createBatsman(name2);
      openBowlerPicker(bowlingPlayers, bowlerName => {
        getInnings().currentBowler = bowlerName;
        getInnings().bowlers[bowlerName] = createBowler(bowlerName);
        showPage('score');
        renderScoreboard();
      });
    });
  });
}

// ── Batsman / Bowler Pickers ──────────────────────────────────
function openBatsmanPicker(title, players, callback) {
  document.getElementById('modal-batsman-title').textContent = title;
  const list = document.getElementById('modal-batsman-list');
  list.innerHTML = players.map(p => `
    <div class="modal-item" data-name="${esc(p)}">
      <span class="modal-item-name">${esc(p)}</span>
      <span class="modal-item-icon">›</span>
    </div>
  `).join('');
  list.querySelectorAll('.modal-item').forEach(el => {
    el.addEventListener('click', () => {
      hideModal('batsman');
      callback(el.dataset.name);
    });
  });
  showModal('batsman');
}

function openBowlerPicker(players, callback) {
  const list = document.getElementById('modal-bowler-list');
  const inn = getInnings();
  list.innerHTML = players.map(p => {
    const b = inn.bowlers[p];
    const stat = b ? `${oversDisplay(b.overs * 6 + b.ballsThisOver)} ov, ${b.wickets}W` : '';
    return `<div class="modal-item" data-name="${esc(p)}">
      <span class="modal-item-name">${esc(p)}</span>
      <span class="modal-item-stat text-muted text-sm">${stat}</span>
      <span class="modal-item-icon">›</span>
    </div>`;
  }).join('');
  list.querySelectorAll('.modal-item').forEach(el => {
    el.addEventListener('click', () => {
      hideModal('bowler');
      callback(el.dataset.name);
    });
  });
  showModal('bowler');
}

// ── Scoring Buttons ───────────────────────────────────────────
function initScoringButtons() {
  // Run buttons
  document.querySelectorAll('.score-btn[data-run]').forEach(btn => {
    btn.addEventListener('click', () => addBall({ type: 'run', runs: +btn.dataset.run }));
  });
  document.getElementById('btn-wicket').addEventListener('click', () => showWicketModal());
  document.getElementById('btn-wide').addEventListener('click', () => addBall({ type: 'wide', runs: 1 }));
  document.getElementById('btn-noball').addEventListener('click', () => addBall({ type: 'noball', runs: 1 }));
  document.getElementById('btn-undo').addEventListener('click', () => undoLastBall());
  document.getElementById('btn-end-over').addEventListener('click', () => forceEndOver());
  document.getElementById('btn-end-innings').addEventListener('click', () => {
    if (confirm('End this innings now?')) endInnings();
  });
  document.getElementById('btn-export').addEventListener('click', () => exportMatch(STATE.match));
  document.getElementById('btn-change-striker').addEventListener('click', () => {
    const inn = getInnings();
    const tmp = inn.onStrikeBatsman;
    inn.onStrikeBatsman = inn.nonStrikeBatsman;
    inn.nonStrikeBatsman = tmp;
    renderScoreboard();
    showToast('Strike changed');
  });
  document.getElementById('btn-change-bowler').addEventListener('click', () => {
    const inn = getInnings();
    openBowlerPicker(inn._bowlingPlayers, name => {
      if (!inn.bowlers[name]) inn.bowlers[name] = createBowler(name);
      inn.currentBowler = name;
      renderScoreboard();
      showToast(`${name} now bowling`);
    });
  });
}

// ── Core Ball Logic ───────────────────────────────────────────
function addBall(ball) {
  const inn = getInnings();
  if (inn.completed) return;
  const { type, runs } = ball;
  const isLegal = type !== 'wide' && type !== 'noball';

  // Update runs
  inn.runs += runs;

  // Update batsman
  const striker = inn.batsmen[inn.onStrikeBatsman];
  if (striker && isLegal) {
    striker.runs += runs;
    striker.balls++;
    if (runs === 4) striker.fours++;
    if (runs === 6) striker.sixes++;
  }
  if (striker && !isLegal) {
    // On wide/noball, no ball count for batsman
    if (type === 'noball') { striker.runs += (runs - 1); } // runs - 1 penalty run to batter
  }

  // Update bowler
  const bowler = inn.bowlers[inn.currentBowler];
  if (bowler) {
    bowler.runs += runs;
    if (type === 'wide') bowler.wides++;
    else if (type === 'noball') bowler.noBalls++;
    else bowler.ballsThisOver++;
  }

  // Extras
  if (type === 'wide') inn.extras.wides++;
  if (type === 'noball') inn.extras.noBalls++;

  // Legal ball count
  if (isLegal) inn.balls++;

  // Ball history entry
  const overNum = Math.floor(inn.balls / 6);
  const ballInOver = inn.balls % 6;
  const histLabel = type === 'wide' ? 'WD' : type === 'noball' ? 'NB' : type === 'wicket' ? 'W' : String(runs);
  const histEntry = { over: `${isLegal ? Math.floor((inn.balls-1)/6) : Math.floor(inn.balls/6)}.${isLegal ? (inn.balls-1)%6+1 : inn.balls%6}`, val: histLabel, type };
  inn.ballHistory.unshift(histEntry);
  inn.currentOverBalls.push({ val: histLabel, type });

  // Strike rotation
  if (isLegal && runs % 2 === 1) {
    const tmp = inn.onStrikeBatsman;
    inn.onStrikeBatsman = inn.nonStrikeBatsman;
    inn.nonStrikeBatsman = tmp;
  }

  // Check over completion
  if (isLegal && inn.balls % 6 === 0 && inn.balls > 0) {
    completeOver();
    return;
  }

  // Check innings end
  checkInningsEnd();
  autoSave();
  renderScoreboard();
}

function showWicketModal() {
  const inn = getInnings();
  const activeBatsmen = [inn.onStrikeBatsman, inn.nonStrikeBatsman].filter(Boolean);
  const outList = document.getElementById('modal-wicket-list');
  outList.innerHTML = activeBatsmen.map(p => `
    <div class="modal-item" data-name="${esc(p)}" id="wicket-out-item">
      <span class="modal-item-name">${esc(p)}</span>
      <span class="modal-item-icon">›</span>
    </div>
  `).join('');

  const remainingBatsmen = inn._battingPlayers.filter(p =>
    !inn.batsmen[p] || (inn.batsmen[p] && !inn.batsmen[p].out && p !== inn.onStrikeBatsman && p !== inn.nonStrikeBatsman)
  );

  const nextList = document.getElementById('modal-next-batsman-list');
  nextList.innerHTML = remainingBatsmen.length > 0
    ? remainingBatsmen.map(p => `
        <div class="modal-item next-batsman-item" data-name="${esc(p)}">
          <span class="modal-item-name">${esc(p)}</span>
          <span class="modal-item-icon">›</span>
        </div>
      `).join('')
    : '<div style="padding:12px 12px;color:var(--text-2);font-size:13px;">All out — innings will end</div>';

  let outPlayer = null;
  let nextPlayer = null;

  outList.querySelectorAll('.modal-item').forEach(el => {
    el.addEventListener('click', () => {
      outList.querySelectorAll('.modal-item').forEach(i => i.style.background = '');
      el.style.background = 'var(--accent-lt)';
      outPlayer = el.dataset.name;
      tryConfirmWicket();
    });
  });

  nextList.querySelectorAll('.next-batsman-item').forEach(el => {
    el.addEventListener('click', () => {
      nextList.querySelectorAll('.next-batsman-item').forEach(i => i.style.background = '');
      el.style.background = 'var(--accent-lt)';
      nextPlayer = el.dataset.name;
      tryConfirmWicket();
    });
  });

  function tryConfirmWicket() {
    if (!outPlayer) return;
    hideModal('wicket');
    processWicket(outPlayer, nextPlayer);
  }

  if (remainingBatsmen.length === 0) {
    outList.querySelectorAll('.modal-item').forEach(el => {
      el.addEventListener('click', () => {
        outPlayer = el.dataset.name;
        hideModal('wicket');
        processWicket(outPlayer, null);
      });
    });
  }

  showModal('wicket');
}

function processWicket(outPlayer, nextPlayer) {
  const inn = getInnings();
  const bowler = inn.bowlers[inn.currentBowler];

  // Mark out
  if (inn.batsmen[outPlayer]) inn.batsmen[outPlayer].out = true;
  else { inn.batsmen[outPlayer] = createBatsman(outPlayer); inn.batsmen[outPlayer].out = true; }

  inn.wickets++;
  inn.balls++;
  inn.runs; // no run change on dot-wicket
  if (bowler) { bowler.wickets++; bowler.ballsThisOver++; bowler.runs += 0; }

  const overNum = Math.floor((inn.balls - 1) / 6);
  const ballInOver = (inn.balls - 1) % 6 + 1;
  inn.ballHistory.unshift({ over: `${overNum}.${ballInOver}`, val: 'W', type: 'wicket' });
  inn.currentOverBalls.push({ val: 'W', type: 'wicket' });

  // Replace
  if (outPlayer === inn.onStrikeBatsman) {
    if (nextPlayer) {
      inn.onStrikeBatsman = nextPlayer;
      if (!inn.batsmen[nextPlayer]) inn.batsmen[nextPlayer] = createBatsman(nextPlayer);
    } else {
      inn.onStrikeBatsman = null;
    }
  } else {
    if (nextPlayer) {
      inn.nonStrikeBatsman = nextPlayer;
      if (!inn.batsmen[nextPlayer]) inn.batsmen[nextPlayer] = createBatsman(nextPlayer);
    } else {
      inn.nonStrikeBatsman = null;
    }
  }

  // Check over
  if (inn.balls > 0 && inn.balls % 6 === 0) {
    completeOver();
    return;
  }

  checkInningsEnd();
  autoSave();
  renderScoreboard();
}

function completeOver() {
  const inn = getInnings();
  const bowler = inn.bowlers[inn.currentBowler];
  if (bowler) {
    bowler.overs++;
    bowler.ballsThisOver = 0;
  }
  // Rotate strike at end of over
  const tmp = inn.onStrikeBatsman;
  inn.onStrikeBatsman = inn.nonStrikeBatsman;
  inn.nonStrikeBatsman = tmp;
  inn.currentOverBalls = [];

  // Check overs limit
  if (inn.balls >= STATE.match.totalOvers * 6) {
    endInnings();
    return;
  }

  checkInningsEnd();
  autoSave();
  renderScoreboard();

  // Ask for new bowler
  const bowlingPlayers = inn._bowlingPlayers;
  openBowlerPicker(bowlingPlayers, name => {
    if (!inn.bowlers[name]) inn.bowlers[name] = createBowler(name);
    inn.currentBowler = name;
    renderScoreboard();
  });
}

function forceEndOver() {
  const inn = getInnings();
  if (inn.currentOverBalls.length === 0) { showToast('No balls bowled this over'); return; }
  completeOver();
}

function checkInningsEnd() {
  const inn = getInnings();
  const match = STATE.match;
  const maxBalls = match.totalOvers * 6;
  const allOut = inn.wickets >= inn._battingPlayers.length - 1;
  const oversUp = inn.balls >= maxBalls;
  const noActiveBatsman = !inn.onStrikeBatsman || !inn.nonStrikeBatsman;

  if (allOut || oversUp || noActiveBatsman) {
    endInnings();
  }
}

function endInnings() {
  const inn = getInnings();
  inn.completed = true;
  autoSave();

  if (STATE.match.currentInnings === 0) {
    // Setup 2nd innings
    STATE.match.currentInnings = 1;
    const inn2 = getInnings();
    const target = inn.runs + 1;
    inn2.target = target;

    showToast(`1st Innings: ${inn.runs}/${inn.wickets}. Target: ${target}`);

    // Pick openers for 2nd innings
    const bat2 = inn2._battingPlayers;
    const bowl2 = inn2._bowlingPlayers;
    openBatsmanPicker('Opening Batsman (Striker)', bat2, s => {
      inn2.onStrikeBatsman = s;
      inn2.batsmen[s] = createBatsman(s);
      openBatsmanPicker('Opening Batsman (Non-Striker)', bat2.filter(p => p !== s), ns => {
        inn2.nonStrikeBatsman = ns;
        inn2.batsmen[ns] = createBatsman(ns);
        openBowlerPicker(bowl2, bowlerName => {
          inn2.currentBowler = bowlerName;
          inn2.bowlers[bowlerName] = createBowler(bowlerName);
          renderScoreboard();
        });
      });
    });
  } else {
    // Match over
    concludeMatch();
  }
}

function concludeMatch() {
  const match = STATE.match;
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  match.status = 'result';

  const teamBatFirst = inn1.battingTeam;
  const teamBatSecond = inn2.battingTeam;
  const score1 = inn1.runs;
  const score2 = inn2.runs;
  const wkts2 = inn2.wickets;
  const maxWkts = inn2._battingPlayers.length - 1;

  let winner, margin;
  if (score2 > score1) {
    winner = teamBatSecond;
    const remainingWickets = maxWkts - wkts2;
    margin = `won by ${remainingWickets} wicket${remainingWickets !== 1 ? 's' : ''}`;
  } else if (score1 > score2) {
    winner = teamBatFirst;
    const runDiff = score1 - score2;
    margin = `won by ${runDiff} run${runDiff !== 1 ? 's' : ''}`;
  } else {
    winner = 'Match Tied';
    margin = 'Match tied!';
  }

  match.winnerTeam = winner;
  match.winnerMargin = winner !== 'Match Tied' ? `${winner} ${margin}` : margin;

  // Result display
  document.getElementById('result-winner-name').textContent = winner;
  document.getElementById('result-margin').textContent = match.winnerMargin;
  document.getElementById('result-label-a').textContent = teamBatFirst;
  document.getElementById('result-label-b').textContent = teamBatSecond;
  document.getElementById('result-score-a').textContent = `${score1}/${inn1.wickets}`;
  document.getElementById('result-score-b').textContent = `${score2}/${wkts2}`;

  autoSave();
  showPage('result');
}

// ── Undo ──────────────────────────────────────────────────────
function undoLastBall() {
  showToast('Undo feature: re-open match from history after restart');
}

// ── Render Scoreboard ─────────────────────────────────────────
function renderScoreboard() {
  const match = STATE.match;
  const inn = getInnings();
  const isFirst = STATE.match.currentInnings === 0;

  // Innings label
  document.getElementById('innings-label').textContent = isFirst ? '1st Innings' : '2nd Innings';

  // Score
  document.getElementById('score-team-name').textContent = inn.battingTeam.toUpperCase();
  document.getElementById('score-runs').textContent = inn.runs;
  document.getElementById('score-wickets').textContent = inn.wickets;
  document.getElementById('score-overs').textContent = oversDisplay(inn.balls);
  document.getElementById('score-crr').textContent = calcCRR(inn.runs, inn.balls);

  // Target strip (2nd innings)
  if (!isFirst && inn.target) {
    const need = inn.target - inn.runs;
    const remainingBalls = (match.totalOvers * 6) - inn.balls;
    const rrr = remainingBalls > 0 ? ((need / remainingBalls) * 6).toFixed(2) : '—';
    document.getElementById('target-strip').style.display = '';
    document.getElementById('target-val').textContent = inn.target;
    document.getElementById('target-need').textContent = need > 0
      ? `Need ${need} off ${remainingBalls} ball${remainingBalls !== 1 ? 's' : ''}`
      : 'Target achieved!';
    document.getElementById('rrr-section').style.display = '';
    document.getElementById('rrr-divider').style.display = '';
    document.getElementById('score-rrr').textContent = rrr;
  } else {
    document.getElementById('target-strip').style.display = 'none';
    document.getElementById('rrr-section').style.display = 'none';
    document.getElementById('rrr-divider').style.display = 'none';
  }

  // Batsmen table
  const striker = inn.onStrikeBatsman;
  const nonStriker = inn.nonStrikeBatsman;
  const tbody = document.getElementById('batsmen-tbody');
  const activeBatsmen = [striker, nonStriker].filter(Boolean);
  tbody.innerHTML = activeBatsmen.map(name => {
    const b = inn.batsmen[name] || createBatsman(name);
    const sr = calcSR(b.runs, b.balls);
    const isOnStrike = name === striker;
    return `<tr class="player-row ${isOnStrike ? 'active' : ''}">
      <td><span class="player-name ${isOnStrike ? 'on-strike' : ''}">${esc(name)}</span></td>
      <td class="player-stat fw-700">${b.runs}</td>
      <td class="player-stat">${b.balls}</td>
      <td class="player-stat">${b.fours}</td>
      <td class="player-stat">${b.sixes}</td>
      <td class="player-stat">${sr}</td>
    </tr>`;
  }).join('');

  // Bowler table
  const bowlerName = inn.currentBowler;
  const bowlerTbody = document.getElementById('bowler-tbody');
  if (bowlerName && inn.bowlers[bowlerName]) {
    const bw = inn.bowlers[bowlerName];
    const econ = calcEcon(bw.runs, bw.overs, bw.ballsThisOver);
    const oversStr = `${bw.overs}.${bw.ballsThisOver}`;
    bowlerTbody.innerHTML = `<tr class="player-row active">
      <td><span class="player-name">${esc(bowlerName)}</span></td>
      <td class="player-stat">${oversStr}</td>
      <td class="player-stat">${bw.runs}</td>
      <td class="player-stat fw-700">${bw.wickets}</td>
      <td class="player-stat">${econ}</td>
    </tr>`;

    // Other bowlers who have bowled
    Object.entries(inn.bowlers).filter(([n]) => n !== bowlerName).forEach(([n, bw2]) => {
      if (bw2.overs > 0 || bw2.ballsThisOver > 0) {
        const e2 = calcEcon(bw2.runs, bw2.overs, bw2.ballsThisOver);
        bowlerTbody.innerHTML += `<tr class="player-row">
          <td><span class="player-name" style="color:var(--text-2)">${esc(n)}</span></td>
          <td class="player-stat">${bw2.overs}.${bw2.ballsThisOver}</td>
          <td class="player-stat">${bw2.runs}</td>
          <td class="player-stat">${bw2.wickets}</td>
          <td class="player-stat">${e2}</td>
        </tr>`;
      }
    });
  }

  // This over
  const thisOver = document.getElementById('this-over-balls');
  thisOver.innerHTML = inn.currentOverBalls.map(b => `
    <span class="ball-chip is-${b.val.toLowerCase()}">${b.val}</span>
  `).join('');

  // Ball history
  const histList = document.getElementById('ball-history-list');
  histList.innerHTML = inn.ballHistory.slice(0, 30).map(h => `
    <span class="ball-chip is-${h.val.toLowerCase()}">
      <span class="over-num">${h.over}</span>
      <span class="ball-val">${h.val}</span>
    </span>
  `).join('');
}

// ── History Page ──────────────────────────────────────────────
function openHistory() {
  renderHistory();
  showPage('history');
}

function renderHistory() {
  const list = getHistory();
  const content = document.getElementById('history-list-content');
  const empty = document.getElementById('history-empty');
  const card = document.getElementById('history-card');

  if (list.length === 0) {
    card.style.display = 'none';
    empty.style.display = '';
    return;
  }
  card.style.display = '';
  empty.style.display = 'none';

  content.innerHTML = list.map(m => `
    <div class="history-item" data-id="${m.id}" style="border-bottom:1px solid var(--border);">
      <div class="history-teams">
        <div class="teams">${esc(m.teamA)} vs ${esc(m.teamB)}</div>
        <div class="result-line">${esc(m.winnerMargin || getScoreSummary(m))}</div>
      </div>
      <div>
        <div class="history-date">${formatDate(m.createdAt)}</div>
        <div style="font-size:10px;color:var(--text-2);text-align:right;">${m.totalOvers} ov</div>
      </div>
      <div class="history-arrow">›</div>
    </div>
  `).join('');

  content.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const m = getHistory().find(x => x.id === el.dataset.id);
      if (m) {
        STATE._scorecardMatch = m;
        renderScorecardPage(m);
        showPage('scorecard');
      }
    });
  });
}

function getScoreSummary(m) {
  const inn1 = m.innings[0];
  if (!inn1) return 'In Progress';
  return `${inn1.battingTeam}: ${inn1.runs}/${inn1.wickets}`;
}

// ── Scorecard Page ─────────────────────────────────────────────
function renderScorecardPage(match) {
  STATE._scorecardMatch = match;
  const el = document.getElementById('scorecard-content');

  let html = `
    <div class="page-title">${esc(match.teamA)} vs ${esc(match.teamB)}</div>
    <div class="page-sub mt-4">${match.totalOvers} Overs · ${formatDate(match.createdAt)}</div>
  `;

  if (match.winnerMargin) {
    html += `<div class="card mt-16" style="background:var(--accent-lt);border-color:#99F6E4;">
      <div class="card-body" style="text-align:center;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);">Result</div>
        <div style="font-size:18px;font-weight:800;color:var(--accent);margin-top:4px;">${esc(match.winnerMargin)}</div>
      </div>
    </div>`;
  }

  match.innings.forEach((inn, idx) => {
    if (!inn.battingTeam) return;
    html += `
      <div class="section-label mt-24">${idx + 1}${idx === 0 ? 'st' : 'nd'} Innings — ${esc(inn.battingTeam)}</div>
      <div class="card mb-12">
        <div class="card-header">
          <div>
            <div style="font-size:22px;font-weight:800;letter-spacing:-1px;">${inn.runs}/${inn.wickets}</div>
            <div style="font-size:12px;color:var(--text-2);">${oversDisplay(inn.balls)} Ov · CRR ${calcCRR(inn.runs, inn.balls)}</div>
          </div>
          ${inn.target ? `<div style="text-align:right;"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--accent);">Target</div><div style="font-size:20px;font-weight:800;color:var(--accent);">${inn.target}</div></div>` : ''}
        </div>
        <div class="card-body" style="padding:0 0 4px;">
          <table class="player-table">
            <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              ${Object.values(inn.batsmen).map(b => `
                <tr>
                  <td><span class="player-name">${esc(b.name)}</span> ${b.out ? '<span style="font-size:10px;color:var(--text-2);">out</span>' : '<span style="font-size:10px;color:var(--success);">not out</span>'}</td>
                  <td class="player-stat fw-700">${b.runs}</td>
                  <td class="player-stat">${b.balls}</td>
                  <td class="player-stat">${b.fours}</td>
                  <td class="player-stat">${b.sixes}</td>
                  <td class="player-stat">${calcSR(b.runs, b.balls)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-header" style="border-top:1px solid var(--border);">
          <div class="card-header-title">Bowling</div>
        </div>
        <div class="card-body" style="padding:0 0 4px;">
          <table class="player-table">
            <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
            <tbody>
              ${Object.values(inn.bowlers).map(bw => `
                <tr>
                  <td><span class="player-name">${esc(bw.name)}</span></td>
                  <td class="player-stat">${bw.overs}.${bw.ballsThisOver}</td>
                  <td class="player-stat">${bw.runs}</td>
                  <td class="player-stat fw-700">${bw.wickets}</td>
                  <td class="player-stat">${calcEcon(bw.runs, bw.overs, bw.ballsThisOver)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:10px 14px;background:var(--bg);border-top:1px solid var(--border);">
          <span style="font-size:12px;color:var(--text-2);">Extras: ${inn.extras.wides + inn.extras.noBalls} (WD ${inn.extras.wides}, NB ${inn.extras.noBalls})</span>
        </div>
      </div>
    `;
  });

  html += '<div style="height:32px;"></div>';
  el.innerHTML = html;
}

// ── Options Modal ──────────────────────────────────────────────
function initModals() {
  document.getElementById('overlay-options').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal('options');
  });
  document.getElementById('opt-reset').addEventListener('click', () => {
    hideModal('options');
    if (confirm('Reset this match? This cannot be undone.')) {
      STATE.match = null;
      showPage('dash');
      renderDashboard();
    }
  });
  document.getElementById('opt-export-json').addEventListener('click', () => {
    hideModal('options');
    exportMatch(STATE.match);
  });
  document.getElementById('overlay-batsman').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal('batsman');
  });
  document.getElementById('overlay-bowler').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal('bowler');
  });
  document.getElementById('overlay-wicket').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideModal('wicket');
  });
}

// ── Export ─────────────────────────────────────────────────────
function exportMatch(match) {
  if (!match) return;
  const data = JSON.stringify(match, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sauravscore_${match.teamA}_vs_${match.teamB}_${match.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Match exported as JSON');
}

// ── Helpers ────────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  } catch(e) { return iso; }
}

// Generate SVG icons for PWA (simple colored squares as placeholders)
function generateIcon(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#FAF7F2"/>
    <text x="50%" y="55%" font-size="${size * 0.42}" font-family="-apple-system,sans-serif" font-weight="700" fill="#111827" text-anchor="middle" dominant-baseline="middle">S</text>
    <text x="50%" y="80%" font-size="${size * 0.12}" font-family="-apple-system,sans-serif" font-weight="600" fill="#0F766E" text-anchor="middle" dominant-baseline="middle">SCORE</text>
  </svg>`;
}
