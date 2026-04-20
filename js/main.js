// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   MAIN — run() orchestrator · DOMContentLoaded init
   ═══════════════════════════════════════════════════════ */

/**
 * Main calculation entry point.
 * Reads all inputs → validates → builds payout → updates all UI panels.
 * Called on any input change, preset switch, or page load.
 */
function run() {
  const errors = validateInputs();
  if (!renderValidationErrors(errors)) return;

  const entries  = Math.max(1, Math.round(gNum('entries')));
  const buyin    = gNum('buyin');
  const rake     = gNum('rake');
  const staffPct = gNum('staff') / 100;
  const itmPct   = gNum('itmPct') / 100;
  const minMult  = Math.max(1, gNum('minCash'));
  const rf       = parseInt(document.getElementById('rounding').value, 10) || 10000;
  const useDirectPool = document.getElementById('poolMode').checked;

  // Re-entry / add-on (optional). players clamp ≤ entries; addon 100% → pool.
  const playersRaw = Math.round(gNum('players'));
  const players    = playersRaw > 0 ? Math.min(playersRaw, entries) : 0;
  const addon      = gNum('addon');
  const addonBase  = players > 0 ? players : entries;
  const addonTotal = Math.max(0, addon) * addonBase;

  CEntries = entries;

  let pool, totalDeduct;

  if (useDirectPool) {
    pool        = gNum('directPool');
    totalDeduct = 0;
    if (pool <= 0) {
      renderTbodyEmpty('💰', 'Chưa có prize pool',
        'Nhập số tiền pool vào ô <b>Prize Pool</b> bên trái để tính phân bổ.');
      setT('stPool', '—'); setT('topPool', '—');
      return;
    }
  } else {
    pool        = (entries * buyin - rake * entries) * (1 - staffPct) + addonTotal;
    totalDeduct = (rake * entries) + (entries * buyin - rake * entries) * staffPct;
    if (pool <= 0) {
      renderTbodyEmpty('⚠️', 'Pool không hợp lệ',
        'Rake ≥ buy-in → pool âm. Giảm rake hoặc tăng buy-in.');
      setT('stPool', fmtVND(0)); setT('topPool', fmtVND(0));
      return;
    }
  }

  const itmCount = Math.max(1, Math.round(entries * itmPct));

  if (CPool !== pool || CRF !== rf || CResults.length !== itmCount) {
    OVR.clear();
    expandedGroups.clear();
    updateResetBtn();
  }
  CPool    = pool;
  CRF      = rf;
  CMinCash = Math.ceil(buyin * minMult / rf) * rf;

  setT('stPool',    fmtVND(pool));
  setT('stDeduct',  useDirectPool ? '—' : fmtVND(totalDeduct));
  const reText = (players > 0 && entries > players)
    ? ` · ${(entries / players).toFixed(2)}× re-entry`
    : '';
  setT('stItm',     itmCount + ' người' + reText);
  setT('stMin',     fmtVND(CMinCash));
  setT('topPool',   fmtVND(pool));
  setT('topDeduct', useDirectPool ? '—' : fmtVND(totalDeduct));

  const { results, rawPcts, indivN } = buildPayout(CP, itmCount, pool, buyin, rf, minMult);

  if (CIndivN !== indivN || CResults.length !== results.length) expandedGroups.clear();
  CResults = results;
  CIndivN  = indivN;

  setT('ps1', results[0] ? fmtVND(results[0].amount) : '—');
  setT('ps2', results[1] ? fmtVND(results[1].amount) : '—');
  setT('ps3', results[2] ? fmtVND(results[2].amount) : '—');

  let ftW = 0, midW = 0, grpW = 0;
  for (let i = 1; i <= Math.min(9, itmCount); i++)       ftW  += rawPcts[i];
  for (let i = 10; i <= Math.min(indivN, itmCount); i++) midW += rawPcts[i];
  for (let i = indivN + 1; i <= itmCount; i++)           grpW += rawPcts[i];

  setT('stFT',  (ftW * 100).toFixed(1) + '%');
  setT('topFT', (ftW * 100).toFixed(1) + '%');

  document.getElementById('distBar').innerHTML =
    `<div class="dist-seg" style="width:${(ftW  * 100).toFixed(1)}%;background:var(--gold);opacity:.8"></div>` +
    `<div class="dist-seg" style="width:${(midW * 100).toFixed(1)}%;background:#4a7aaa;opacity:.8"></div>` +
    `<div class="dist-seg" style="width:${(grpW * 100).toFixed(1)}%;background:#3a7a3a;opacity:.8"></div>`;

  CMP.results = computeShadowResults();
  updateCompareHeader();

  const ws = computeWarnings(results, indivN, pool, itmCount, buyin);
  renderWarnings(ws);

  renderTable(results, indivN);
  recalcBreakage();

  const now = new Date();
  const cmpSuffix = (CMP.on && CMP.results.length) ? ` · So sánh A=${CP.toUpperCase()} vs B=${shadowPresetLabel()}` : '';
  setT('printTitle', `Quads Hanoi — Payout ${CP.toUpperCase()} · ${entries} người · ${fmtVND(pool)}${cmpSuffix}`);
  const playerMeta = (players > 0 && entries > players)
    ? ` · ${players} người chơi (avg ${(entries / players).toFixed(2)} entries)` : '';
  const addonMeta = (addonTotal > 0)
    ? ` · Add-on: +${fmtVND(addonTotal)}` : '';
  setT('printMeta',
    `In ngày ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')} · ` +
    `ITM: ${itmCount} người (${(itmPct * 100).toFixed(1)}%) · ` +
    `Min Cash: ${fmtVND(CMinCash)} · ` +
    `Làm tròn: ${rf.toLocaleString()}₫` + playerMeta + addonMeta
  );

  saveState();

  updateWptBadge();
}

/**
 * Hiển thị badge độ chính xác WPT dựa trên field size.
 * Ẩn nếu không phải WPT preset.
 */
function updateWptBadge() {
  const badge = document.getElementById('wptAccBadge');
  if (!badge) return;

  if (CP !== 'wpt') {
    badge.style.display = 'none';
    return;
  }

  badge.style.display = 'block';
  const e = CEntries;

  if (e < 80 || e > 400) {
    badge.textContent = `⚠ ${e} người — ngoài vùng chuẩn (80–400)`;
    badge.style.cssText = 'display:block;font-size:8px;font-weight:600;letter-spacing:.06em;padding:3px 8px;border-radius:4px;margin-top:4px;text-align:center;background:rgba(201,76,76,.09);color:#c94c4c;border:1px solid rgba(201,76,76,.22)';
  } else if (e === 100 || e === 250 || e === 400) {
    badge.textContent = `✓ ${e} người — anchor point chính xác`;
    badge.style.cssText = 'display:block;font-size:8px;font-weight:600;letter-spacing:.06em;padding:3px 8px;border-radius:4px;margin-top:4px;text-align:center;background:rgba(76,170,90,.09);color:#4caa5a;border:1px solid rgba(76,170,90,.22)';
  } else {
    badge.textContent = `≈ ${e} người — nội suy tuyến tính`;
    badge.style.cssText = 'display:block;font-size:8px;font-weight:600;letter-spacing:.06em;padding:3px 8px;border-radius:4px;margin-top:4px;text-align:center;background:rgba(76,138,201,.09);color:#4c8ac9;border:1px solid rgba(76,138,201,.22)';
  }
}

/* ── Compare header update ── */
function updateCompareHeader() {
  let th      = document.getElementById('thShadow');
  const dTot  = document.getElementById('cmpDeltaTotal');
  const aLbl  = document.getElementById('cmpALabel');
  const c1    = document.getElementById('top3Card1');
  const c2    = document.getElementById('top3Card2');
  const c3    = document.getElementById('top3Card3');
  const on    = CMP.on && CMP.results.length > 0;

  [c1, c2, c3].forEach(c => c && c.classList.toggle('show-b', on));

  if (aLbl) aLbl.textContent = CP.toUpperCase();

  if (on && !th) {
    const headRow = document.querySelector('table thead tr');
    if (headRow) {
      th = document.createElement('th');
      th.className = 'th-shadow th-gold';
      th.id = 'thShadow';
      th.innerHTML = 'B — <span id="thShadowName">—</span>';
      const anchor = headRow.children[3];
      headRow.insertBefore(th, anchor || null);
    }
  } else if (!on && th) {
    th.remove();
    th = null;
  }
  if (th) {
    const thNm = document.getElementById('thShadowName');
    if (thNm) thNm.textContent = shadowPresetLabel();
  }

  ['ps1b','ps2b','ps3b'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (on && CMP.results[i]) {
      const amtB = CMP.results[i].amount;
      const amtA = CResults[i] ? (OVR.has(i+1) ? OVR.get(i+1) : CResults[i].amount) : 0;
      const d = amtA - amtB;
      const sign = d >= 0 ? '+' : '';
      el.innerHTML = `B: ${fmtVND(amtB)}  <span style="color:${d>=0?'#6aaa5a':'#aa5a5a'}">(${sign}${fmtVND(d)})</span>`;
    } else if (el) el.textContent = '';
  });

  if (dTot) {
    if (on) {
      let totA = 0, totB = 0;
      CResults.forEach(r => { totA += OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });
      CMP.results.forEach(r => { totB += r.amount; });
      const d = totA - totB;
      const sign = d >= 0 ? '+' : '';
      const col = Math.abs(d) < 1000 ? 'var(--t3)' : d > 0 ? '#6aaa5a' : '#aa5a5a';
      dTot.innerHTML = `ΣA − ΣB = <strong style="color:${col}">${sign}${fmtVND(d)}</strong>`;
    } else {
      dTot.textContent = '';
    }
  }
}

/* ── Wire commit snapshots vào input/slider changes ── */
function wireInputCommits() {
  const textIds = ['entries','players','addon','buyin','rake','staff','itmPct','minCash','directPool','slopeNum','grpStartNum','gDecayNum'];
  textIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let valBefore = el.value;
    el.addEventListener('focus', () => { valBefore = el.value; });
    el.addEventListener('change', () => {
      if (el.value !== valBefore) {
        const snap = readStateFromDOM();
        snap[id === 'directPool' ? 'directPool' :
             id === 'slopeNum'    ? 'slopeNum' :
             id === 'grpStartNum' ? 'grpStartNum' :
             id === 'gDecayNum'   ? 'gDecayNum' : id] = valBefore;
        if (!historyPaused) {
          snap.__label = `Đổi ${id}: ${valBefore} → ${el.value}`;
          const last = undoStack[undoStack.length - 1];
          if (!last || JSON.stringify({...last, __label:0}) !== JSON.stringify({...snap, __label:0})) {
            undoStack.push(snap);
            while (undoStack.length > MAX_HISTORY) undoStack.shift();
            redoStack.length = 0;
            updateHistoryButtons();
          }
        }
        valBefore = el.value;
      }
    });
  });

  ['customSlope','customGroupStart','customGroupDecay'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let valBefore = el.value;
    let dirty = false;
    el.addEventListener('input', () => {
      if (!dirty) { dirty = true; }
    });
    el.addEventListener('change', () => {
      if (el.value !== valBefore && !historyPaused) {
        const snap = readStateFromDOM();
        const key = id === 'customSlope' ? 'slope' : id === 'customGroupStart' ? 'grpStart' : 'decay';
        snap[key] = valBefore;
        snap.__label = `Đổi ${key}: ${valBefore} → ${el.value}`;
        undoStack.push(snap);
        while (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
        updateHistoryButtons();
      }
      valBefore = el.value;
      dirty = false;
    });
  });
}

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const target = e.target;
    const tag = target && target instanceof HTMLElement ? target.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      toggleShortcutHelp();
      return;
    }
  }

  if (!(e.ctrlKey || e.metaKey)) return;

  if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault();
    performRedo();
    return;
  }
  if (e.key === 'z') {
    e.preventDefault();
    performUndo();
    return;
  }
  if (e.key === 'R' && e.shiftKey) {
    e.preventDefault();
    if (OVR.size > 0) { resetOverrides(); showToast('↩ Đã reset tất cả sửa đổi', 'ok-t'); }
    return;
  }
  if (e.key === 's') { e.preventDefault(); saveUserPresetPrompt(); return; }
  if (e.key === 'p') { e.preventDefault(); window.print(); return; }
  if (e.key === 'e') { e.preventDefault(); exportCSV(); return; }
});

/* ── Compact table toggle ── */
const COMPACT_KEY = 'quads_payout_compact_v1';

function applyCompactState(on) {
  const wrap = document.querySelector('.tbl-wrap');
  const btn  = document.getElementById('compactBtn');
  const lbl  = document.getElementById('compactBtnLbl');
  if (wrap) wrap.classList.toggle('compact', !!on);
  if (btn)  btn.classList.toggle('active', !!on);
  if (lbl)  lbl.textContent = on ? 'Mở rộng' : 'Thu gọn';
}

function toggleCompact() {
  const wrap = document.querySelector('.tbl-wrap');
  const on = !(wrap && wrap.classList.contains('compact'));
  applyCompactState(on);
  try { localStorage.setItem(COMPACT_KEY, on ? '1' : '0'); } catch (e) {}
}

function loadCompactState() {
  try { applyCompactState(localStorage.getItem(COMPACT_KEY) === '1'); } catch (e) {}
}

/** Hiện/ẩn overlay liệt kê keyboard shortcuts. */
function toggleShortcutHelp() {
  let el = document.getElementById('shortcutHelp');
  if (el) { el.remove(); return; }
  el = document.createElement('div');
  el.id = 'shortcutHelp';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:inherit';
  el.innerHTML = `
    <div style="background:var(--bg2,#1a1a1a);border:1px solid var(--bd,#333);border-radius:8px;padding:20px 24px;max-width:420px;color:var(--t1,#ddd);font-size:12px;line-height:1.9">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold,#d4a843)">Phím tắt</div>
      <div><kbd>Ctrl</kbd>+<kbd>Z</kbd> — Hoàn tác</div>
      <div><kbd>Ctrl</kbd>+<kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> — Làm lại</div>
      <div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> — Reset sửa đổi thủ công</div>
      <div><kbd>Ctrl</kbd>+<kbd>S</kbd> — Lưu preset hiện tại</div>
      <div><kbd>Ctrl</kbd>+<kbd>E</kbd> — Xuất CSV</div>
      <div><kbd>Ctrl</kbd>+<kbd>P</kbd> — In</div>
      <div><kbd>?</kbd> — Hiện/ẩn cheatsheet này</div>
      <div style="margin-top:12px;font-size:10px;opacity:.6">Click ngoài hoặc bấm <kbd>?</kbd> / <kbd>Esc</kbd> để đóng</div>
    </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) el.remove(); });
  const escHandler = ev => { if (ev.key === 'Escape') { el.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(el);
}

/* ── Theme toggle (light/dark) ── */
const THEME_KEY = 'quads_payout_theme_v1';

function applyTheme(t) {
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const ic = document.getElementById('themeIcon');
  if (ic) ic.textContent = (t === 'light') ? '☀️' : '🌙';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
}

function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light') applyTheme('light'); else applyTheme('dark');
  } catch (e) { applyTheme('dark'); }
}

/* ── Mobile drawer ── */
function toggleMobileDrawer() {
  const d = document.getElementById('mDrawer');
  const b = document.getElementById('mDrawerBackdrop');
  if (!d || !b) return;
  const open = d.classList.toggle('open');
  b.classList.toggle('open', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

/* ── Initialisation ── */
window.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadUserPresets();
  renderUserPresets();

  // Nếu có ?s=... trên URL, ưu tiên apply trước. Nếu user đồng ý → ghi đè
  // localStorage; nếu user huỷ → fall back về state thường.
  const sharedApplied = (typeof tryApplySharedState === 'function') && tryApplySharedState();
  const hadSavedState = sharedApplied || loadState();

  if (!hadSavedState) {
    const p = PRESETS[CP];
    document.getElementById('presetDesc').textContent = p.desc;
    if (p.defaultItm     != null) document.getElementById('itmPct').value  = p.defaultItm;
    if (p.defaultMinCash != null) document.getElementById('minCash').value = p.defaultMinCash;
    activatePresetUI(CP, false);
  }

  applyCompareUI();
  wireInputCommits();
  updateHistoryButtons();
  loadCompactState();

  run();

  if (PENDING_OVR && CResults.length > 0) {
    Object.keys(PENDING_OVR).forEach(k => {
      const rank = parseInt(k, 10);
      if (rank >= 1 && rank <= CResults.length) OVR.set(rank, PENDING_OVR[k]);
    });
    PENDING_OVR = null;
    if (OVR.size > 0) {
      updateResetBtn();
      renderTable(CResults, CIndivN);
      recalcBreakage();
    }
  }
});
