'use strict';
/* ─── config.js ─── */
/* ═══════════════════════════════════════════════════════
   CONFIG — Constants · WPT Data · Presets · Global State
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── Constants ── */
const PRESET_TOP_N = 20;
const STORAGE_KEY  = 'quads_payout_v1';

/* ══ WPT DYNAMIC ANCHORS
   Values = % of pool at that entry count (1-in-8 structure)
   Anchor 100P: column "97-104 entries"  (Payout B sheet)
   Anchor 250P: column "249-256 entries"
   Anchor 400P: column "401-408 entries" (approx)           ══ */
const WPT_A100 = [
  30.50, 18.75, 11.50, 7.50, 5.85, 4.675, 3.975, 3.45, 3.05, 2.75,
   2.75,  2.75,  2.50, 2.35, 2.25, 1.95, 1.925, 1.825, 1.50, 1.40
];
const WPT_A250 = [
  22.976, 16.681, 10.250, 6.235, 4.815, 3.990, 3.400, 2.965, 2.544, 2.165,
   2.165,  2.165,  1.850, 1.850, 1.850, 1.535, 1.535, 1.535, 1.225, 1.225
];
const WPT_A400 = [
  20.910, 14.639, 9.373, 6.165, 4.735, 3.938, 3.295, 2.698, 2.091, 1.742,
   1.742,  1.742, 1.480, 1.480, 1.480, 1.208, 1.208, 1.208, 1.005, 1.005
];

/* ── Static presets ── */
const PRESETS = {
  wpt: {
    desc: 'WPT Main Tour. Cấu trúc 1-in-8 (12.5% ITM). Tự động điều chỉnh phân bổ theo số người tham dự (100–400). Dựa trên bảng tính WPT Official Payout Calculator.',
    defaultItm: 12.5, defaultMinCash: 2.0,
    topPct: null, groupDecay: null // computed dynamically
  },
  wsop: {
    desc: 'WSOP Circuit 2026. Calibrated từ 3 event tại Planet Hollywood: 71–1349 entries. Phân bổ đều hơn APT/WPT, phù hợp field lớn. 1st ≈ 13–28% tuỳ field.',
    defaultItm: 15, defaultMinCash: 2.0,
    topPct: [14.0,9.0,6.2,4.5,3.4,2.55,1.92,1.52,1.18,0.95,
              0.95,0.78,0.78,0.64,0.64,0.64,0.64,0.53,0.53,0.53],
    groupDecay: 0.95
  },
  apt: {
    desc: 'APT Asia Pacific Tour. Calibrated từ APT Jeju 2026 Main Event & APT Taiwan 2025 (Ultra Stack). Top-heavy hơn WSOP, 1st/2nd ratio ≈ 1.7. Phù hợp field 50–400.',
    defaultItm: 13, defaultMinCash: 1.5,
    topPct: [25.0,14.8,10.0,7.3,5.8,4.4,3.3,2.55,2.05,1.72,
              1.72,1.48,1.48,1.28,1.28,1.10,1.10,0.96,0.96,0.96],
    groupDecay: 0.90
  },
  triton: {
    desc: 'Triton Super High Roller. Rất dốc về đỉnh — 1st ≈ 30–45%, 1st/2nd ratio ≈ 1.65. Chỉ phù hợp field nhỏ 20–100 người.',
    defaultItm: 10, defaultMinCash: 2.0,
    topPct: [28.0,16.5,10.5,7.2,5.5,4.1,3.2,2.6,2.1,1.75,
              1.50,1.28,1.10,0.95,0.82,0.72,0.63,0.55,0.48,0.42],
    groupDecay: 0.84
  },
  custom: {
    desc: 'Tuỳ chỉnh: sử dụng slope (độ dốc rank), số rank lẻ và hệ số suy giảm nhóm để tạo cấu trúc riêng.',
    defaultItm: null, defaultMinCash: 1.5,
    topPct: null, groupDecay: null
  }
};

/* ── Global mutable state ── */
let CP       = 'wsop';         // current preset key
let CResults = [];             // last buildPayout results
let CPool    = 0;              // current prize pool
let CRF      = 10000;         // current rounding factor
let CIndivN  = PRESET_TOP_N;  // individual rank count
let CEntries = 0;             // current entries
let CDisplayRows = [];        // rows shown in table
let CMinCash     = 0;         // min cash VND

const OVR            = new Map();  // manual overrides: rank → amount
const expandedGroups = new Set();  // expanded group start ranks

/* ─── validation.js ─── */
/* ═══════════════════════════════════════════════════════
   VALIDATION — Input validation layer
   Chạy trước mỗi run(). Block tính toán nếu có lỗi.
   ═══════════════════════════════════════════════════════ */

/**
 * Validate tất cả inputs hiện tại trong DOM.
 * Trả về array errors. Nếu rỗng → hợp lệ, run() tiếp tục.
 *
 * @returns {Array<{field: string, msg: string}>}
 */
function validateInputs() {
  const errors = [];
  const useDirectPool = document.getElementById('poolMode')?.checked;

  const entries  = gNum('entries');
  const buyin    = gNum('buyin');
  const rake     = gNum('rake');
  const staff    = gNum('staff');
  const itmPct   = gNum('itmPct');
  const minCash  = gNum('minCash');

  /* ── Entries ── */
  if (!entries || entries < 2)
    errors.push({ field: 'entries', msg: 'Số người phải ≥ 2' });
  else if (entries > 10000)
    errors.push({ field: 'entries', msg: 'Tối đa 10,000 người' });

  /* ── Buy-in ── */
  if (!buyin || buyin <= 0)
    errors.push({ field: 'buyin', msg: 'Buy-in phải > 0' });
  else if (buyin < 10000)
    errors.push({ field: 'buyin', msg: 'Buy-in tối thiểu 10,000 ₫' });

  /* ── Rake & Staff (chỉ khi không dùng direct pool) ── */
  if (!useDirectPool) {
    if (rake < 0)
      errors.push({ field: 'rake', msg: 'Rake không được âm' });
    else if (buyin > 0 && rake >= buyin)
      errors.push({ field: 'rake', msg: 'Rake phải nhỏ hơn buy-in' });

    if (staff < 0 || staff > 50)
      errors.push({ field: 'staff', msg: 'Vận hành: 0% – 50%' });

    // Pool phải > 0 sau khi trừ rake + staff
    if (!errors.length && buyin > 0 && entries > 0) {
      const pool = (entries * buyin - rake * entries) * (1 - staff / 100);
      if (pool <= 0)
        errors.push({ field: 'rake', msg: 'Rake + vận hành quá cao — pool về 0' });
    }
  }

  /* ── Direct pool ── */
  if (useDirectPool) {
    const dp = gNum('directPool');
    if (dp > 0 && buyin > 0 && dp < buyin * 2) {
      // Warning nhẹ — không block, chỉ highlight
      errors.push({ field: 'directPool', msg: `Pool nhỏ hơn 2× buy-in (${fmtVND(buyin * 2)}) — kiểm tra lại`, warn: true });
    }
  }

  /* ── ITM % ── */
  if (itmPct < 5 || itmPct > 40)
    errors.push({ field: 'itmPct', msg: 'ITM: 5% – 40%' });

  /* ── Min Cash multiplier ── */
  if (minCash < 1 || minCash > 10)
    errors.push({ field: 'minCash', msg: 'Min Cash: 1× – 10×' });

  /* ── Pool-too-small check: pool không đủ honor min cash cho tất cả ITM ──
     Khi pool < itmCount × (buyin × minCash), engine sẽ chạy equal split
     thay vì phân bổ theo preset. User cần biết điều này.
     Không block — chỉ warn vì equal split vẫn là kết quả hợp lệ.           */
  if (!errors.some(e => !e.warn)) {  // chỉ check khi không có lỗi blocking
    const useDirectPool = document.getElementById('poolMode')?.checked;
    const pool = useDirectPool
      ? gNum('directPool')
      : (entries * buyin - gNum('rake') * entries) * (1 - gNum('staff') / 100);
    const itmCount = Math.max(1, Math.round(entries * itmPct / 100));
    const minCashVND = buyin * minCash;
    const minRequired = itmCount * minCashVND;

    if (pool > 0 && minRequired > pool) {
      const ratio = (minRequired / pool * 100).toFixed(0);
      errors.push({
        field: 'minCash',
        msg: `Pool (${fmtVND(pool)}) nhỏ hơn tổng min cash (${fmtVND(minRequired)} = ${itmCount}× ${fmtVND(minCashVND)}) — engine sẽ chia đều`,
        warn: true
      });
    }
  }

  return errors;
}

/**
 * Render validation errors vào UI.
 * Errors với {warn: true} highlight màu vàng nhưng không block.
 *
 * @returns {boolean} true nếu không có lỗi blocking, false nếu có
 */
function renderValidationErrors(errors) {
  // Clear tất cả error state cũ
  document.querySelectorAll('.inp-err, .inp-warn').forEach(el => {
    el.classList.remove('inp-err', 'inp-warn');
  });
  document.querySelectorAll('.val-tip').forEach(el => el.remove());

  const blocking = errors.filter(e => !e.warn);
  const warnings = errors.filter(e => e.warn);

  // Render blocking errors
  blocking.forEach(err => {
    const input = document.getElementById(err.field);
    if (!input) return;
    input.classList.add('inp-err');
    const tip = document.createElement('div');
    tip.className = 'val-tip val-tip-err';
    tip.textContent = '⚠ ' + err.msg;
    input.parentElement.appendChild(tip);
  });

  // Render warnings (không block)
  warnings.forEach(w => {
    const input = document.getElementById(w.field);
    if (!input) return;
    input.classList.add('inp-warn');
    const tip = document.createElement('div');
    tip.className = 'val-tip val-tip-warn';
    tip.textContent = w.msg;
    input.parentElement.appendChild(tip);
  });

  // Focus input lỗi đầu tiên
  if (blocking.length > 0) {
    const first = document.getElementById(blocking[0].field);
    if (first) first.focus();
    return false; // block run()
  }

  return true; // cho phép run() tiếp tục
}

/* ─── utils.js ─── */
/* ═══════════════════════════════════════════════════════
   UTILS — Formatting · DOM helpers · Toast
   ═══════════════════════════════════════════════════════ */

/* ── Number formatting ── */

/** Format input as VNĐ integer, then call run() (debounced) */
function fmtRun(i) {
  const r = i.value.replace(/\D/g, '');
  i.value = r ? parseInt(r, 10).toLocaleString('en-US') : '';
  runDebounced(150);
}

/* ── Debounced run ── */
let _debounceTimer = null;

/** Gọi run() sau delay ms — tránh tính lại liên tục khi gõ */
function runDebounced(delay) {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(run, delay || 150);
}

/** Parse a (possibly comma-formatted) number from an input element */
function gNum(id) {
  return parseFloat(document.getElementById(id).value.replace(/,/g, '')) || 0;
}

/** Format VNĐ with locale separator + ₫ */
const fmtVND = n => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';

/** Format integer with comma thousands separator */
const fmtN = n => Math.round(n).toLocaleString('en-US');

/* ── DOM helpers ── */

/** Set textContent of element by id */
const setT = (id, v) => {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
};

/* ── Toast notifications ── */

/**
 * Show a floating toast message.
 * @param {string} msg   - Message text
 * @param {string} type  - CSS class suffix: 'info', 'warn-t', 'ok-t'
 * @param {number} dur   - Duration in ms (default 3200)
 */
function showToast(msg, type = 'info', dur = 3200) {
  const container = document.getElementById('toast');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast-item ${type}-t`;
  el.textContent = msg;
  container.appendChild(el);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add('show'))
  );

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, dur);
}

/* ─── engine.js ─── */
/* ═══════════════════════════════════════════════════════
   ENGINE — Payout Calculation Core
   · WPT dynamic interpolation
   · buildGroups
   · buildPayout  (two-phase floor, monotonic enforcement)
   · tierInfo
   · computeWarnings / renderWarnings
   ═══════════════════════════════════════════════════════ */

/* ── WPT dynamic anchor interpolation ── */

/**
 * Interpolate top-N % weights for a given entry count.
 * Uses WPT_A100 / WPT_A250 / WPT_A400 anchors (defined in config.js).
 */
function wptForEntries(entries) {
  const e = Math.max(80, Math.min(400, entries));
  let pct, decay;

  if (e <= 100) {
    pct   = WPT_A100.slice();
    decay = 0.94;
  } else if (e <= 250) {
    const t = (e - 100) / 150;
    pct   = WPT_A100.map((v, i) => v + (WPT_A250[i] - v) * t);
    decay = 0.94 - 0.06 * t;
  } else {
    const t = (e - 250) / 150;
    pct   = WPT_A250.map((v, i) => v + (WPT_A400[i] - v) * t);
    decay = 0.88 - 0.04 * t;
  }

  return { pct, decay };
}

/* ── Group builder ── */

/**
 * Build grouped ranges [s, e] with progressively larger group sizes.
 * @returns {Array<{start, end, count}>}
 */
function buildGroups(s, e) {
  const g = [];
  let pos = s, gs = 3;
  while (pos <= e) {
    const end = Math.min(pos + gs - 1, e);
    g.push({ start: pos, end, count: end - pos + 1 });
    pos = end + 1;
    if (gs < 6) gs++;
    else if (gs < 10) gs += 2;
    else if (gs < 20) gs += 3;
    gs = Math.min(gs, 20);
  }
  return g;
}

/* ── Core payout engine ── */

/**
 * Build payout amounts for all ITM positions.
 *
 * Algorithm:
 *  1. Assign raw weight % per rank (preset-specific)
 *  2. Two-phase floor: ranks below minCash get floored up
 *  3. Scale remaining pool across above-floor ranks
 *  4. Apply rounding factor rf
 *  5. Monotonic enforcement (bottom-up)
 *
 * @param {string} preset   - Key in PRESETS
 * @param {number} itmCount - Number of paid positions
 * @param {number} pool     - Total prize pool (VNĐ)
 * @param {number} buyin    - Buy-in amount
 * @param {number} rf       - Rounding factor (e.g. 10000)
 * @param {number} minMult  - Min cash multiplier of buy-in
 * @returns {{ results, rawPcts, indivN }}
 */
function buildPayout(preset, itmCount, pool, buyin, rf, minMult, opts = {}) {
  if (itmCount < 1 || pool <= 0) {
    return { results: [], rawPcts: new Array(itmCount + 1).fill(0), indivN: 0 };
  }

  /* ── Optional opts (for shadow preset / named preset):
       entries, slope, grpStart, decay, topPct, groupDecay
     Nếu không truyền → đọc từ DOM/global như cũ. ── */
  const entriesArg = opts.entries ?? CEntries;

  const floorVND = buyin * minMult;
  const pcts = new Array(itmCount + 1).fill(0);
  let indivN, gDecay;

  /* ── Step 1: Raw weight assignment ── */
  if (preset === 'custom') {
    const slope  = opts.slope   ?? (parseFloat(document.getElementById('customSlope').value)      || 0.87);
    const gStart = opts.grpStart ?? (parseInt  (document.getElementById('customGroupStart').value) || 15);
    gDecay       = opts.decay   ?? (parseFloat(document.getElementById('customGroupDecay').value) || 0.82);
    indivN = Math.min(gStart, itmCount);

    let rs = 0;
    for (let i = 1; i <= indivN; i++) { pcts[i] = Math.pow(slope, i - 1); rs += pcts[i]; }
    if (itmCount > indivN) {
      const lw = pcts[indivN];
      buildGroups(indivN + 1, itmCount).forEach((g, gi) => {
        const v = lw * Math.pow(gDecay, gi + 1);
        for (let r = g.start; r <= g.end; r++) pcts[r] = v;
        rs += v * g.count;
      });
    }
    if (rs > 0) for (let i = 1; i <= itmCount; i++) pcts[i] /= rs;

  } else if (preset === 'wpt') {
    const { pct: dynPct, decay } = wptForEntries(entriesArg);
    gDecay = decay;  // nhất quán: luôn dùng gDecay như custom & static branches
    indivN = Math.min(PRESET_TOP_N, itmCount, dynPct.length);

    let rs = 0;
    for (let i = 1; i <= indivN; i++) { pcts[i] = dynPct[i - 1]; rs += pcts[i]; }
    if (itmCount > indivN) {
      const lw = pcts[indivN];
      buildGroups(indivN + 1, itmCount).forEach((g, gi) => {
        const v = lw * Math.pow(gDecay, gi + 1);
        for (let r = g.start; r <= g.end; r++) pcts[r] = v;
        rs += v * g.count;
      });
    }
    if (rs > 0) for (let i = 1; i <= itmCount; i++) pcts[i] /= rs;

  } else {
    const p   = PRESETS[preset];
    gDecay    = p.groupDecay;
    indivN    = Math.min(PRESET_TOP_N, itmCount, p.topPct.length);

    let rs = 0;
    for (let i = 1; i <= indivN; i++) { pcts[i] = p.topPct[i - 1]; rs += pcts[i]; }
    if (itmCount > indivN) {
      const lw = pcts[indivN];
      buildGroups(indivN + 1, itmCount).forEach((g, gi) => {
        const v = lw * Math.pow(gDecay, gi + 1);
        for (let r = g.start; r <= g.end; r++) pcts[r] = v;
        rs += v * g.count;
      });
    }
    if (rs > 0) for (let i = 1; i <= itmCount; i++) pcts[i] /= rs;
  }

  /* ── Step 2: Iterative floor detection ──────────────────────────────
     Bug fix: one-shot floor detection mis-classifies "non-floored" ranks
     that still land BELOW the floor after scaling (because scale < 1 when
     many ranks are floored).  We iterate until the floored set stabilises,
     ensuring every non-floored rank's scaled dollar amount ≥ floorVND.
  ─────────────────────────────────────────────────────────────────────── */
  const flooredSet = new Set();
  let scale = 1;

  for (let iter = 0; iter < 30; iter++) {
    let nfSum = 0;
    for (let i = 1; i <= itmCount; i++) {
      if (!flooredSet.has(i)) nfSum += pcts[i];
    }

    const ceiledFloor = Math.ceil(floorVND / rf) * rf;   // amount thực tế 1 floored rank nhận
    const floorTotal  = flooredSet.size * ceiledFloor;   // budget đúng, tránh ceil overhang
    const remaining   = pool - floorTotal;

    if (remaining <= 0 || nfSum <= 0) { scale = 0; break; }

    scale = remaining / (nfSum * pool);

    let changed = false;
    for (let i = 1; i <= itmCount; i++) {
      if (!flooredSet.has(i) && pcts[i] * pool * scale < floorVND) {
        flooredSet.add(i);
        changed = true;
      }
    }
    if (!changed) break; // stable — every non-floored rank is safely above floor
  }

  /* Edge case: pool too small for even equal-share flooring */
  if (scale <= 0) {
    const eq = Math.floor(pool / itmCount / rf) * rf;
    const r2  = [];
    for (let i = 1; i <= itmCount; i++) {
      r2.push({ rank: i, pct: pcts[i], amount: eq, floored: true, spct: eq / pool });
    }
    return { results: r2, rawPcts: pcts, indivN };
  }

  /* ── Step 3 & 4: Scale + round ── */
  const results = [];
  for (let i = 1; i <= itmCount; i++) {
    const isF = flooredSet.has(i);
    const raw  = isF ? floorVND : pcts[i] * pool * scale;
    const amt  = isF ? Math.ceil(raw / rf) * rf : Math.floor(raw / rf) * rf;
    results.push({ rank: i, pct: pcts[i], amount: amt, floored: isF, spct: amt / pool });
  }

  /* ── Step 5: Monotonic enforcement (bottom → top) ── */
  for (let i = results.length - 2; i >= 0; i--) {
    if (results[i].amount < results[i + 1].amount) {
      results[i].amount = results[i + 1].amount;
      results[i].spct   = results[i].amount / pool; // FIX: sync spct after bump
    }
  }

  /* ── Step 6: Reconciliation — Σ amounts ≤ pool, breakage ∈ [0, rf) ── */
  const ceiledFloor = Math.ceil(floorVND / rf) * rf;
  let total = results.reduce((s, r) => s + r.amount, 0);
  let diff  = pool - total;

  // Âm → trừ dần từ top xuống, tôn trọng monotonic & floor
  for (let i = 0; i < results.length && diff < 0; i++) {
    const r      = results[i];
    const minAmt = r.floored ? ceiledFloor
                             : (results[i + 1]?.amount ?? 0);
    const cut    = Math.min(r.amount - minAmt, -diff);
    const steps  = Math.floor(cut / rf) * rf;
    if (steps > 0) {
      r.amount -= steps;
      r.spct    = r.amount / pool;
      diff     += steps;
    }
  }

  // Dương → giữ nguyên làm breakage (không auto-cộng vào Rank 1).
  // User có thể bấm nút "Add breakage to Rank 1" nếu muốn gộp thủ công.

  return { results, rawPcts: pcts, indivN };
}

/* ── Tier badge info ── */

/**
 * Return badge label + colors for a given rank.
 */
function tierInfo(rank, effF, indivN) {
  if (rank === 1) return { label: 'CHAMPION',    bg: 'rgba(201,168,76,.20)',  color: '#d4a843', bd: 'rgba(201,168,76,.40)' };
  if (rank === 2) return { label: 'RUNNER-UP',   bg: 'rgba(220,220,220,.07)', color: '#c0c0c0', bd: '#3a3a3a' };
  if (rank === 3) return { label: 'PODIUM',      bg: 'rgba(160,90,20,.22)',   color: '#cc7a30', bd: 'rgba(160,90,20,.45)' };
  if (rank <= 9)  return { label: 'FINAL TABLE', bg: 'rgba(30,60,120,.20)',   color: '#7aaad8', bd: 'rgba(60,100,160,.40)' };
  if (rank <= indivN) return { label: 'ITM',     bg: 'rgba(50,90,50,.18)',    color: '#78c078', bd: 'rgba(60,110,60,.40)' };
  if (!effF)      return { label: 'GROUP',       bg: 'rgba(80,60,20,.16)',    color: '#b89040', bd: 'rgba(120,90,30,.38)' };
  return              { label: 'MIN CASH',       bg: 'rgba(255,255,255,.03)', color: '#686868', bd: '#2c2c2c' };
}

/* ── Warning system ── */

/**
 * Per-preset thresholds cho warning system.
 * Triton được phép có 1st cao hơn, WSOP được phép 1st thấp hơn.
 */
const WARN_THRESHOLDS = {
  wpt:    { min1st: 0.14, max1st: 0.42, minFT: 0.42, minR12: 1.3 },
  wsop:   { min1st: 0.10, max1st: 0.35, minFT: 0.38, minR12: 1.3 },
  apt:    { min1st: 0.15, max1st: 0.42, minFT: 0.40, minR12: 1.5 },
  triton: { min1st: 0.20, max1st: 0.60, minFT: 0.35, minR12: 1.5 },
  custom: { min1st: 0.10, max1st: 0.55, minFT: 0.35, minR12: 1.2 },
};

/**
 * Compute an array of warning objects from results.
 * Thresholds theo preset để tránh false positives (vd: Triton 1st=40% không phải lỗi).
 */
function computeWarnings(results, indivN, pool, itmCount, buyin) {
  const ws = [];
  if (!results.length) return ws;

  const T      = WARN_THRESHOLDS[CP] || WARN_THRESHOLDS.wsop;
  const pct1   = results[0]?.spct || 0;
  const ftW    = results.slice(0, Math.min(9, results.length)).reduce((s, r) => s + r.spct, 0);
  const floorN = results.filter(r => r.floored).length;
  const r1r2   = (results[1]?.spct || 0) > 0 ? (results[0].spct / results[1].spct) : 0;

  /* ── 1st place % ── */
  if (pct1 < T.min1st)
    ws.push({ type: 'error', ic: '🔴',
      msg: `1st place ${(pct1*100).toFixed(1)}% — Quá thấp cho ${CP.toUpperCase()} (tối thiểu ${(T.min1st*100).toFixed(0)}%). Giảm ITM% hoặc chọn preset dốc hơn.` });
  else if (pct1 > T.max1st)
    ws.push({ type: 'warn', ic: '🟡',
      msg: `1st place ${(pct1*100).toFixed(1)}% — Khá cao (>${(T.max1st*100).toFixed(0)}% với ${CP.toUpperCase()}). Field nhỏ?` });

  /* ── Final Table weight ── */
  if (ftW < T.minFT && itmCount >= 9)
    ws.push({ type: 'warn', ic: '🟡',
      msg: `Final Table chỉ ${(ftW*100).toFixed(1)}% pool — Flat. Tăng ITM% hoặc preset dốc hơn.` });

  /* ── Floor-heavy ── */
  if (itmCount > 0 && floorN / itmCount > 0.50)
    ws.push({ type: 'warn', ic: '🟡',
      msg: `${floorN}/${itmCount} vị trí nhận Min Cash (${(floorN/itmCount*100).toFixed(0)}%). Giảm ITM% hoặc Min Cash multiplier.` });

  /* ── 1st/2nd ratio ── */
  if (r1r2 > 0 && r1r2 < T.minR12 && itmCount >= 9)
    ws.push({ type: 'info', ic: 'ℹ️',
      msg: `1st/2nd ratio ${r1r2.toFixed(2)}× — Thấp cho ${CP.toUpperCase()} (chuẩn ≥${T.minR12}×). FT cảm giác flat.` });

  /* ── WPT field-size out of calibrated range ── */
  if (CP === 'wpt' && CEntries > 0) {
    if (CEntries < 80)
      ws.push({ type: 'warn', ic: '🟡',
        msg: `WPT calibrated cho 80–400 người. Field ${CEntries} người quá nhỏ — kết quả là ước tính.` });
    else if (CEntries > 400)
      ws.push({ type: 'info', ic: 'ℹ️',
        msg: `WPT calibrated cho 80–400 người. Field ${CEntries} người — dùng anchor 400P, kết quả gần đúng.` });
  }

  /* ── Direct pool mode ── */
  if (document.getElementById('poolMode').checked)
    ws.push({ type: 'info', ic: 'ℹ️',
      msg: `Pool trực tiếp — Phí & Rake không được tính. Breakage = Pool − Tổng giải thưởng.` });

  /* ── Safety net: breakage âm (sau tất cả fix vẫn có thể xảy ra ở edge case) ── */
  if (pool > 0) {
    let total = 0;
    results.forEach(r => { total += OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });
    const brk = pool - total;
    if (brk < -(CRF || 10000))
      ws.push({ type: 'error', ic: '🔴',
        msg: `Lỗi nghiêm trọng: Breakage âm ${fmtVND(brk)} — Tổng vượt pool! Liên hệ dev.` });
  }

  return ws;
}

/** Render warnings into #warnPanel */
function renderWarnings(ws) {
  const panel = document.getElementById('warnPanel');
  if (!ws.length) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.style.display = 'flex';
  panel.innerHTML = ws.map(w =>
    `<div class="warn-card ${w.type}"><span class="warn-ic">${w.ic}</span><span>${w.msg}</span></div>`
  ).join('');
}

/* ─── preset.js ─── */
/* ═══════════════════════════════════════════════════════
   PRESET — Preset selection · Pool mode · Slider sync
   ═══════════════════════════════════════════════════════ */

/* ── Pool mode ── */

/**
 * Update pool-mode UI only — không gọi run().
 * Dùng trong restore và từ togglePoolMode().
 */
function applyPoolModeUI(on) {
  document.getElementById('poolDirectWrap').classList.toggle('show', on);
  document.getElementById('rakeWrap').querySelector('input').classList.toggle('inp-disabled', on);
  document.getElementById('staffWrap').querySelector('input').classList.toggle('inp-disabled', on);
}

/** Toggle pool mode (user action) — update UI rồi recalc */
function togglePoolMode() {
  const on = document.getElementById('poolMode').checked;
  commitSnapshot(on ? 'Bật pool trực tiếp' : 'Tắt pool trực tiếp');
  applyPoolModeUI(on);
  run();
}

/* ── Slider ↔ Number input sync ── */

function syncSlider(sId, nId, dec) {
  const v = parseFloat(document.getElementById(sId).value);
  document.getElementById(nId).value = dec > 0 ? v.toFixed(dec) : Math.round(v);
  run();
}

function syncNum(nId, sId, mn, mx, dec) {
  const raw = parseFloat(document.getElementById(nId).value);
  if (isNaN(raw) || raw < mn || raw > mx) return;
  document.getElementById(sId).value = raw;
  run();
}

function clampNum(nId, sId, mn, mx, dec) {
  const raw = parseFloat(document.getElementById(nId).value);
  const v   = isNaN(raw) ? mn : Math.max(mn, Math.min(mx, raw));
  document.getElementById(nId).value = dec > 0 ? v.toFixed(dec) : Math.round(v);
  document.getElementById(sId).value = v;
  run();
}

/* ── Preset selection ── */

/**
 * Activate preset UI only — button highlights, panel open/close,
 * description text, ITM%/minCash defaults — KHÔNG gọi run().
 * Dùng trong loadState() để tránh run() với state chưa đầy đủ.
 *
 * @param {string}  key      - preset key
 * @param {boolean} setDefaults - true khi first-load, false khi restore (ITM% đã saved)
 */
function activatePresetUI(key, setDefaults = true) {
  // Khi switch sang custom, seed sliders từ preset hiện tại (chỉ khi user click, không phải restore)
  if (key === 'custom' && CP !== 'custom' && setDefaults) {
    const CMAP = {
      wpt:    { slope: 0.86, topN: 20, decay: 0.90 },
      wsop:   { slope: 0.87, topN: 20, decay: 0.95 },
      apt:    { slope: 0.82, topN: 20, decay: 0.90 },
      triton: { slope: 0.79, topN: 20, decay: 0.84 }
    };
    const m = CMAP[CP];
    if (m) {
      document.getElementById('customSlope').value      = m.slope;
      document.getElementById('slopeNum').value         = m.slope.toFixed(2);
      document.getElementById('customGroupStart').value = m.topN;
      document.getElementById('grpStartNum').value      = m.topN;
      document.getElementById('customGroupDecay').value = m.decay;
      document.getElementById('gDecayNum').value        = m.decay.toFixed(2);
    }
  }

  CP = key;

  // Button highlights
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const ct = document.getElementById('custToggle');
  ct.classList.remove('active');

  if (key === 'custom') {
    ct.classList.add('active');
    document.getElementById('custPanel').classList.add('open');
  } else {
    const b = document.querySelector(`.preset-btn[data-p="${key}"]`);
    if (b) b.classList.add('active');
    document.getElementById('custPanel').classList.remove('open');
  }

  // Description
  const p = PRESETS[key];
  document.getElementById('presetDesc').textContent = p.desc;

  // Defaults (chỉ set khi first-load, không ghi đè giá trị đã saved)
  if (setDefaults) {
    if (p.defaultItm     != null) document.getElementById('itmPct').value  = p.defaultItm;
    if (p.defaultMinCash != null) document.getElementById('minCash').value = p.defaultMinCash;
  }
}

/**
 * Select preset (user action) — activate UI + clear overrides + run().
 */
function selectPreset(key) {
  commitSnapshot('Đổi preset: ' + CP.toUpperCase() + ' → ' + key.toUpperCase());
  activatePresetUI(key, true);  // setDefaults = true (user đang chọn mới)
  OVR.clear();
  expandedGroups.clear();
  updateResetBtn();
  renderShadowOptions();  // shadow không được trùng preset A
  run();
}

/* ─── table.js ─── */
/* ═══════════════════════════════════════════════════════
   TABLE — Display Rows · Delta · Render · Group Toggle
   ═══════════════════════════════════════════════════════ */

/* ── Build all current amounts (overrides applied) ── */

function buildAllAmts() {
  const m = {};
  CResults.forEach(r => { m[r.rank] = OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });
  return m;
}

/* ── Delta string ── */

/**
 * Return HTML string for the "gap vs next rank" cell.
 */
function getDeltaStr(rank, all) {
  const next = all[rank + 1];
  if (next === undefined) return '<span class="delta-zero">—</span>';
  const d = (all[rank] || 0) - next;
  if (d > 0)  return `<span class="delta-pos">+${fmtN(d)} ₫</span>`;
  if (d === 0) return '<span class="delta-zero">↔ 0</span>';
  return `<span class="delta-neg">${fmtN(d)} ₫</span>`;
}

/* ── Build display rows (group consecutive same-amount group ranks) ── */

/**
 * Convert flat results[] into display rows,
 * collapsing group positions with the same amount into one row.
 */
function buildDisplayRows(results, indivN) {
  const rows = [];
  let i = 0;
  while (i < results.length) {
    const r0   = results[i];
    const rank = r0.rank;

    // Individual ranks (≤ indivN) → always a single row
    if (rank <= indivN) {
      rows.push({
        startRank: rank, endRank: rank,
        amount: r0.amount, pct: r0.spct,
        floored: r0.floored, count: 1, results: [r0]
      });
      i++;
      continue;
    }

    // Group ranks → collapse consecutive matching amounts
    const amt = r0.amount;
    let j = i + 1;
    while (j < results.length && results[j].rank > indivN && results[j].amount === amt) j++;

    const gr = results.slice(i, j);
    const tP = gr.reduce((s, r) => s + r.spct, 0);
    rows.push({
      startRank: r0.rank, endRank: results[j - 1].rank,
      amount: amt, pct: tP / gr.length,
      floored: r0.floored, count: gr.length, results: gr
    });
    i = j;
  }
  return rows;
}

/* ── Render table ── */

/**
 * Helper: trả về <td> shadow cho rank (nếu compare mode bật) hoặc chuỗi rỗng.
 * amtA = amount của A tại rank đó (đã apply override nếu có).
 */
function shadowCellFor(rank, amtA) {
  if (!CMP.on || !CMP.results.length) return '';
  const sr = CMP.results[rank - 1];
  if (!sr) return '<td class="td-shadow">—</td>';
  const amtB  = sr.amount;
  const delta = amtA - amtB;
  const cls   = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
  const sign  = delta > 0 ? '+' : '';
  return `<td class="td-shadow">${fmtVND(amtB)}<span class="sh-delta ${cls}">${sign}${fmtVND(delta)}</span></td>`;
}

/**
 * Rebuild the entire <tbody> HTML from CResults + OVR.
 */
function renderTable(results, indivN) {
  const dRows = buildDisplayRows(results, indivN);
  CDisplayRows = dRows;
  const all  = buildAllAmts();
  const html = [];
  const showB = CMP.on && CMP.results.length > 0;

  dRows.forEach(row => {
    const { startRank: sr, endRank: er, amount, count } = row;
    const rCls  = sr <= 3 ? `r${sr}` : '';
    const rkCls = sr <= 3 ? 'td-rank hi' : sr <= 9 ? 'td-rank mid' : 'td-rank';

    if (count > 1) {
      /* ── Group row ── */
      const gA      = row.results.map(r => OVR.has(r.rank) ? OVR.get(r.rank) : r.amount);
      const allSame = gA.every(v => v === gA[0]);
      const anyOvr  = row.results.some(r => OVR.has(r.rank));
      const isUnif  = anyOvr && allSame && gA[0] !== amount;
      const isMix   = anyOvr && !allSame;

      const gD  = gA[0];
      const gP  = (gD / CPool * 100).toFixed(3);
      const gEF = sr > indivN && gD <= CMinCash;
      const ti  = tierInfo(sr, gEF, indivN);
      const gEC = isUnif ? ' edited' : isMix ? ' mixed' : '';
      const gOC = isUnif ? ' row-ed'  : isMix ? ' row-mx'  : '';
      const gPip= isUnif ? '<span class="edit-pip"></span>' : isMix ? '<span class="mix-pip">≠</span>' : '';
      const arr = `<span class="grp-arrow${expandedGroups.has(sr) ? ' open' : ''}">▶</span>`;

      html.push(`<tr class="grp-header${gOC} ${rCls}">
<td class="${rkCls}" onclick="toggleGroup(${sr})" style="cursor:pointer">${arr}#${sr}–${er}${gPip}</td>
<td class="td-pct" onclick="toggleGroup(${sr})" style="cursor:pointer">${
  isMix ? '<span style="color:var(--amber);font-size:8.5px">MIXED</span>' : gP + '%'
}</td>
<td><div class="td-amt-wrap" onclick="event.stopPropagation()">
  <input class="amt-input${gEC}" type="text" value="${fmtN(gD)}"
    onfocus="onAF(this)" oninput="onAI(this)"
    onblur="onABGrp(this,${sr})" onkeydown="onAKGrp(event,this,${sr})">
  <span class="amt-unit">₫</span>
  <span style="font-size:8.5px;color:var(--t4);margin-left:4px">${count}×</span>
</div></td>
${showB ? shadowCellFor(sr, gD) : ''}
<td onclick="toggleGroup(${sr})" style="cursor:pointer">
  <span class="badge" style="background:${ti.bg};color:${ti.color};border:1px solid ${ti.bd}">${ti.label}</span>
</td>
<td class="td-delta" onclick="toggleGroup(${sr})" style="cursor:pointer">${getDeltaStr(er, all)}</td>
</tr>`);

      // Expanded children
      if (expandedGroups.has(sr)) {
        row.results.forEach(r => {
          const cO  = OVR.has(r.rank);
          const cA  = cO ? OVR.get(r.rank) : r.amount;
          const cP  = (cA / CPool * 100).toFixed(3);
          const cTi = tierInfo(r.rank, cA <= CMinCash, indivN);
          html.push(`<tr class="grp-child${cO ? ' row-ed' : ''}">
<td class="td-rank">${cO ? '<span class="edit-pip"></span>' : ''}#${r.rank}</td>
<td class="td-pct">${cP}%</td>
<td><div class="td-amt-wrap">
  <input class="amt-input${cO ? ' edited' : ''}" type="text" value="${fmtN(cA)}"
    onfocus="onAF(this)" oninput="onAI(this)"
    onblur="onAB(this,${r.rank})" onkeydown="onAK(event,this,${r.rank})">
  <span class="amt-unit">₫</span>
</div></td>
${showB ? shadowCellFor(r.rank, cA) : ''}
<td><span class="badge" style="background:${cTi.bg};color:${cTi.color};border:1px solid ${cTi.bd}">${cTi.label}</span></td>
<td class="td-delta">${getDeltaStr(r.rank, all)}</td>
</tr>`);
        });
      }

    } else {
      /* ── Individual row ── */
      const isO = OVR.has(sr);
      const dA  = isO ? OVR.get(sr) : amount;
      const dP  = (dA / CPool * 100).toFixed(3);
      const eF  = sr > indivN && dA <= CMinCash;
      const ti  = tierInfo(sr, eF, indivN);

      html.push(`<tr class="${rCls}${isO ? ' row-ed' : ''}">
<td class="${rkCls}">${isO ? '<span class="edit-pip"></span>' : ''}#${sr}</td>
<td class="td-pct">${dP}%</td>
<td><div class="td-amt-wrap">
  <input class="amt-input${isO ? ' edited' : ''}${sr === 1 ? ' rank1' : ''}" type="text" value="${fmtN(dA)}"
    data-rank="${sr}" onfocus="onAF(this)" oninput="onAI(this)"
    onblur="onAB(this,${sr})" onkeydown="onAK(event,this,${sr})">
  <span class="amt-unit">₫</span>
</div></td>
${showB ? shadowCellFor(sr, dA) : ''}
<td><span class="badge" style="background:${ti.bg};color:${ti.color};border:1px solid ${ti.bd}">${ti.label}</span></td>
<td class="td-delta">${getDeltaStr(sr, all)}</td>
</tr>`);
    }
  });

  document.getElementById('tbody').innerHTML = html.join('');
}

/* ── Toggle group expand/collapse ── */

function toggleGroup(sr) {
  expandedGroups.has(sr) ? expandedGroups.delete(sr) : expandedGroups.add(sr);
  renderTable(CResults, CIndivN);
  recalcBreakage();
}

/* ─── inputs.js ─── */
/* ═══════════════════════════════════════════════════════
   INPUTS — Amount Editing · Breakage · Reset · CSV Export
   ═══════════════════════════════════════════════════════ */

/* ── Amount input event handlers ── */

/** Focus: select all text */
function onAF(i) { i.select(); }

/** Input: live format with thousands separators, preserve cursor */
function onAI(i) {
  const pos = i.selectionStart;
  const bef = i.value.substring(0, pos);
  const dB  = (bef.match(/\d/g) || []).length;

  const raw = i.value.replace(/[^\d]/g, '');
  if (!raw) { i.value = ''; return; }

  const fmt = parseInt(raw, 10).toLocaleString('en-US');
  i.value = fmt;

  // Restore cursor position relative to digit count
  let cnt = 0, np = 0;
  for (let k = 0; k < fmt.length; k++) {
    if (/\d/.test(fmt[k])) cnt++;
    if (cnt === dB) { np = k + 1; break; }
  }
  if (cnt < dB) np = fmt.length;
  i.setSelectionRange(np, np);
}

/** Blur (individual row): commit override, warn monotonicity */
function onAB(inp, rank) {
  const raw  = parseInt(inp.value.replace(/[^\d]/g, '')) || 0;
  const amt  = Math.round(raw / CRF) * CRF;
  const calc = CResults[rank - 1]?.amount || 0;
  const before = OVR.has(rank) ? OVR.get(rank) : calc;

  // Monotonicity warnings
  if (rank > 1 && CResults[rank - 2]) {
    const prevAmt = OVR.has(rank - 1) ? OVR.get(rank - 1) : CResults[rank - 2].amount;
    if (amt > prevAmt)
      showToast(`⚠ Rank #${rank} (${fmtVND(amt)}) cao hơn rank #${rank - 1} (${fmtVND(prevAmt)})!`, 'warn-t');
  }
  if (rank < CResults.length && CResults[rank]) {
    const nextAmt = OVR.has(rank + 1) ? OVR.get(rank + 1) : CResults[rank].amount;
    if (amt > 0 && amt < nextAmt)
      showToast(`⚠ Rank #${rank} (${fmtVND(amt)}) thấp hơn rank #${rank + 1} (${fmtVND(nextAmt)})!`, 'warn-t');
  }

  const shouldSet = amt > 0 && amt !== calc;
  const willChange = shouldSet ? (before !== amt) : (OVR.has(rank));
  if (willChange) commitSnapshot(`Sửa rank #${rank}: ${fmtVND(before)} → ${fmtVND(shouldSet ? amt : calc)}`);

  if (shouldSet) OVR.set(rank, amt);
  else OVR.delete(rank);

  updateResetBtn();
  renderTable(CResults, CIndivN);
  recalcBreakage();
}

/** Keydown (individual row): Enter → blur, Esc → restore + blur */
function onAK(e, i, rank) {
  if (e.key === 'Enter') { e.preventDefault(); i.blur(); }
  if (e.key === 'Escape') {
    e.preventDefault();
    i.value = fmtN(CResults[rank - 1]?.amount || 0);
    i.blur();
  }
}

/** Blur (group row): apply same amount to all members */
function onABGrp(inp, sr) {
  const raw = parseInt(inp.value.replace(/[^\d]/g, '')) || 0;
  const amt = Math.round(raw / CRF) * CRF;
  const row = CDisplayRows.find(r => r.startRank === sr);
  if (!row) return;

  const shouldSet = amt > 0 && amt !== row.amount;
  commitSnapshot(`Sửa nhóm ${row.startRank}-${row.endRank}: ${fmtVND(shouldSet ? amt : row.amount)}`);

  if (shouldSet) row.results.forEach(r => OVR.set(r.rank, amt));
  else row.results.forEach(r => OVR.delete(r.rank));

  updateResetBtn();
  renderTable(CResults, CIndivN);
  recalcBreakage();
}

/** Keydown (group row): Enter → blur, Esc → restore + blur */
function onAKGrp(e, inp, sr) {
  if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
  if (e.key === 'Escape') {
    e.preventDefault();
    const row = CDisplayRows.find(r => r.startRank === sr);
    if (row) inp.value = fmtN(row.amount);
    inp.blur();
  }
}

/* ── Breakage calculation ── */

/** Recalculate and display breakage (pool − Σ payouts) */
function recalcBreakage() {
  let total = 0;
  CResults.forEach(r => { total += OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });

  const b  = CPool - total;
  const fv = fmtVND(b);

  ['stBreak', 'topBreak'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = fv;
    el.className = 'sv';
    if (b > 50000)       el.classList.add('brk-pos');
    else if (b < -50000) el.classList.add('brk-neg');
    else                  el.classList.add('brk-zero');
  });

  // Update breakage button state
  const brkBtn = document.getElementById('brkBtn');
  if (brkBtn) {
    const canApply = Math.abs(b) >= 1000 && CResults.length > 0;
    brkBtn.classList.toggle('disabled', !canApply);
    brkBtn.title = canApply
      ? (b >= 0 ? `Cộng ${fmtVND(b)} vào rank #1` : `Trừ ${fmtVND(Math.abs(b))} khỏi rank #1`)
      : 'Breakage < 1,000₫';
  }
}

/* ── Reset overrides ── */

/** Show/hide both Reset buttons depending on whether any OVR exist */
function updateResetBtn() {
  const show = OVR.size > 0;
  ['resetBtn', 'resetBtn2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = show ? 'flex' : 'none';
  });
}

/** Clear all manual overrides and re-render */
function resetOverrides() {
  if (OVR.size === 0) return;
  commitSnapshot(`Xoá ${OVR.size} sửa đổi thủ công`);
  OVR.clear();
  expandedGroups.clear();
  updateResetBtn();
  if (CResults.length > 0) {
    renderTable(CResults, CIndivN);
    recalcBreakage();
  }
}

/* ── Breakage → Rank 1 ── */

/** Add all breakage to Rank 1 prize */
function applyBreakageToRank1() {
  if (!CResults.length) return;

  let total = 0;
  CResults.forEach(r => { total += OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });
  const b = Math.round(CPool - total);

  if (Math.abs(b) < 1000) {
    showToast('Breakage quá nhỏ (<1,000₫)', 'info-t');
    return;
  }

  // Xác nhận nếu breakage âm (sẽ giảm rank 1)
  if (b < 0) {
    const confirmed = confirm(
      `Breakage đang âm: ${fmtVND(b)}.\n` +
      `Thao tác này sẽ GIẢM rank #1 đi ${fmtVND(Math.abs(b))}.\n\n` +
      `Tiếp tục?`
    );
    if (!confirmed) return;
  }

  const cur = OVR.has(1) ? OVR.get(1) : CResults[0].amount;
  commitSnapshot(`Breakage → Rank #1 (${b >= 0 ? '+' : ''}${fmtVND(b)})`);
  OVR.set(1, Math.max(0, cur + b));
  updateResetBtn();
  renderTable(CResults, CIndivN);
  recalcBreakage();
  showToast(
    b >= 0
      ? `✓ Đã thêm ${fmtVND(b)} vào Rank #1`
      : `✓ Đã điều chỉnh Rank #1 (−${fmtVND(Math.abs(b))})`,
    'ok-t'
  );
}

/* ── CSV Export ── */

/** Build and download a CSV of the current payout table */
function exportCSV() {
  if (!CDisplayRows.length) return;

  const all      = buildAllAmts();
  const itmCount = CResults.length;
  const showB    = CMP.on && CMP.results.length > 0;
  const bLabel   = showB ? shadowPresetLabel() : '';

  const header = showB
    ? `\uFEFFHạng,Số người,Thưởng A - ${CP.toUpperCase()} (VND),Thưởng B - ${bLabel} (VND),Δ(A-B),Chênh lệch,% Pool,Tổng nhóm (VND)`
    : '\uFEFFHạng,Số người,Thưởng/người (VND),Chênh lệch,% Pool,Tổng nhóm (VND)';
  const lines = [header];

  CDisplayRows.forEach(row => {
    const gA      = row.results.map(r => OVR.has(r.rank) ? OVR.get(r.rank) : r.amount);
    const allSame = gA.every(v => v === gA[0]);

    if (!allSame && row.count > 1) {
      // Mixed group: expand each rank individually
      row.results.forEach((r, ri) => {
        const amt   = gA[ri];
        const delta = r.rank < itmCount ? amt - (all[r.rank + 1] || 0) : '';
        if (showB) {
          const b = CMP.results[r.rank - 1]?.amount || 0;
          lines.push(`"${r.rank}",1,${amt},${b},${amt - b},${delta},${(amt / CPool * 100).toFixed(3)}%,${amt}`);
        } else {
          lines.push(`"${r.rank}",1,${amt},${delta},${(amt / CPool * 100).toFixed(3)}%,${amt}`);
        }
      });
    } else {
      const lbl   = row.startRank === row.endRank ? `${row.startRank}` : `${row.startRank}-${row.endRank}`;
      const avg   = gA[0];
      const tot   = avg * row.count;
      const delta = row.endRank < itmCount ? avg - (all[row.endRank + 1] || 0) : '';
      if (showB) {
        // Use B value tại startRank của nhóm (đại diện)
        const b = CMP.results[row.startRank - 1]?.amount || 0;
        lines.push(`"${lbl}",${row.count},${avg},${b},${avg - b},${delta},${(avg / CPool * 100).toFixed(3)}%,${tot}`);
      } else {
        lines.push(`"${lbl}",${row.count},${avg},${delta},${(avg / CPool * 100).toFixed(3)}%,${tot}`);
      }
    }
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const suffix = showB ? `_vs_${(CMP.shadowPreset || '').replace(':','_')}` : '';
  a.download = `Payout_${CP}${suffix}_${CEntries}entries_${Math.round(gNum('buyin') / 1000)}k.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── storage.js ─── */
/* ═══════════════════════════════════════════════════════
   STORAGE — localStorage auto-save / restore
   Key: STORAGE_KEY (defined in config.js)

   DESIGN: loadState() KHÔNG gọi run().
   Nó chỉ restore DOM values + activate preset UI.
   main.js luôn gọi run() một lần duy nhất sau loadState().
   Điều này đảm bảo custom preset restore dùng đúng slider values.
   ═══════════════════════════════════════════════════════ */

/** Persist current UI state to localStorage */
function saveState() {
  try {
    const dot = document.getElementById('saveDot');
    if (dot) dot.classList.add('saving');

    const s = {
      preset:      CP,
      entries:     document.getElementById('entries').value,
      buyin:       document.getElementById('buyin').value,
      rake:        document.getElementById('rake').value,
      staff:       document.getElementById('staff').value,
      itmPct:      document.getElementById('itmPct').value,
      minCash:     document.getElementById('minCash').value,
      rounding:    document.getElementById('rounding').value,
      poolMode:    document.getElementById('poolMode').checked,
      directPool:  document.getElementById('directPool').value,
      slope:       document.getElementById('customSlope').value,
      grpStart:    document.getElementById('customGroupStart').value,
      decay:       document.getElementById('customGroupDecay').value,
      slopeNum:    document.getElementById('slopeNum').value,
      grpStartNum: document.getElementById('grpStartNum').value,
      gDecayNum:   document.getElementById('gDecayNum').value,
      compareOn:    CMP.on,
      shadowPreset: CMP.shadowPreset
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setTimeout(() => dot && dot.classList.remove('saving'), 800);
  } catch (e) { /* silently ignore quota/security errors */ }
}

/**
 * Restore UI state from localStorage.
 * KHÔNG gọi run() — để main.js gọi sau khi mọi thứ đã được set.
 *
 * @returns {boolean} true nếu có saved state, false nếu không
 */
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return false;  // không có saved state

    /* ── 1. Restore tất cả input values vào DOM ── */
    const set = (id, v) => {
      if (v != null && document.getElementById(id))
        document.getElementById(id).value = v;
    };

    set('entries',    s.entries);
    set('buyin',      s.buyin);
    set('rake',       s.rake);
    set('staff',      s.staff);
    set('itmPct',     s.itmPct);
    set('minCash',    s.minCash);
    set('rounding',   s.rounding);
    set('directPool', s.directPool);

    /* ── 2. Restore custom slider values TRƯỚC activatePresetUI ── */
    /* (vì activatePresetUI với custom sẽ seed từ CMAP nếu setDefaults=true,
        nhưng ở đây setDefaults=false nên không seed — slider được restore đúng) */
    set('customSlope',      s.slope);
    set('customGroupStart', s.grpStart);
    set('customGroupDecay', s.decay);
    set('slopeNum',         s.slopeNum);
    set('grpStartNum',      s.grpStartNum);
    set('gDecayNum',        s.gDecayNum);

    /* ── 3. Restore pool mode UI (không gọi togglePoolMode để tránh run()) ── */
    if (s.poolMode) {
      document.getElementById('poolMode').checked = true;
      applyPoolModeUI(true);  // chỉ update UI, không run()
    }

    /* ── 4. Activate preset UI (không gọi run()) ── */
    if (s.preset && PRESETS[s.preset]) {
      // setDefaults = false: ITM%/minCash đã được restore ở bước 1
      activatePresetUI(s.preset, false);
    }

    /* ── 5. Restore compare mode ── */
    if (s.compareOn != null)    CMP.on = !!s.compareOn;
    if (s.shadowPreset !== undefined) CMP.shadowPreset = s.shadowPreset;

    return true;  // có saved state

  } catch (e) {
    return false;  // parse error → không có state hợp lệ
  }
}

/* ─── state.js ─── */
/* ═══════════════════════════════════════════════════════
   STATE — Single-source-of-truth helpers
   readStateFromDOM()  : đọc toàn bộ UI state thành 1 object
   applyStateToDOM()   : apply object về DOM (không gọi run)
   Dùng cho undo/redo, A/B compare, named presets.
   ═══════════════════════════════════════════════════════ */

function readStateFromDOM() {
  const g = id => document.getElementById(id);
  const ovr = {};
  OVR.forEach((v, k) => { ovr[k] = v; });
  return {
    preset:      CP,
    entries:     g('entries').value,
    buyin:       g('buyin').value,
    rake:        g('rake').value,
    staff:       g('staff').value,
    itmPct:      g('itmPct').value,
    minCash:     g('minCash').value,
    rounding:    g('rounding').value,
    poolMode:    g('poolMode').checked,
    directPool:  g('directPool').value,
    slope:       g('customSlope').value,
    grpStart:    g('customGroupStart').value,
    decay:       g('customGroupDecay').value,
    slopeNum:    g('slopeNum').value,
    grpStartNum: g('grpStartNum').value,
    gDecayNum:   g('gDecayNum').value,
    overrides:   ovr,
    shadowPreset: CMP.shadowPreset,
    compareOn:    CMP.on
  };
}

function applyStateToDOM(s) {
  const set = (id, v) => { if (v != null && document.getElementById(id)) document.getElementById(id).value = v; };

  set('entries',    s.entries);
  set('buyin',      s.buyin);
  set('rake',       s.rake);
  set('staff',      s.staff);
  set('itmPct',     s.itmPct);
  set('minCash',    s.minCash);
  set('rounding',   s.rounding);
  set('directPool', s.directPool);

  set('customSlope',      s.slope);
  set('customGroupStart', s.grpStart);
  set('customGroupDecay', s.decay);
  set('slopeNum',         s.slopeNum);
  set('grpStartNum',      s.grpStartNum);
  set('gDecayNum',        s.gDecayNum);

  if (s.poolMode != null) {
    document.getElementById('poolMode').checked = !!s.poolMode;
    applyPoolModeUI(!!s.poolMode);
  }

  if (s.preset && PRESETS[s.preset]) activatePresetUI(s.preset, false);

  OVR.clear();
  if (s.overrides) {
    Object.keys(s.overrides).forEach(k => OVR.set(parseInt(k, 10), s.overrides[k]));
  }
  expandedGroups.clear();
  updateResetBtn();

  // Compare mode
  if (s.compareOn != null) CMP.on = !!s.compareOn;
  if (s.shadowPreset !== undefined) CMP.shadowPreset = s.shadowPreset;
  applyCompareUI();
}

/* ─── user-presets.js ─── */
/* ═══════════════════════════════════════════════════════
   USER PRESETS — CRUD + import/export preset tuỳ chỉnh
   Key: USER_PRESETS_KEY (localStorage)

   Schema v2 (flat, backwards-compatible với v1):
     { slope, grpStart, decay, itmPct, minCash,       // config
       name, description, recommendedField,           // metadata
       createdAt, updatedAt, createdBy,
       schemaVersion: 2 }
   ═══════════════════════════════════════════════════════ */

const USER_PRESETS_KEY       = 'quads_user_presets_v1';
const MAX_USER_PRESETS       = 20;
const PRESET_SCHEMA_VERSION  = 2;
const PRESET_EXPORT_FORMAT   = 'quads-payout-preset';
const MAX_PRESET_NAME_LEN    = 28;
const MAX_PRESET_DESC_LEN    = 120;

let USER_PRESETS = {};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/**
 * Migrate 1 preset object sang schema hiện tại.
 * Pure — không đụng localStorage. Dùng cho load + import.
 */
function migratePresetShape(name, p) {
  if (p && p.schemaVersion === PRESET_SCHEMA_VERSION) return p;
  const src = p || {};
  const created = src.createdAt || Date.now();
  return {
    slope:    src.slope    ?? 0.87,
    grpStart: src.grpStart ?? 15,
    decay:    src.decay    ?? 0.82,
    itmPct:   src.itmPct   ?? 15,
    minCash:  src.minCash  ?? 2,
    name:             src.name || name,
    description:      src.description      || '',
    recommendedField: src.recommendedField ?? null,
    createdAt:        created,
    updatedAt:        src.updatedAt || created,
    createdBy:        src.createdBy || '',
    schemaVersion:    PRESET_SCHEMA_VERSION
  };
}

function loadUserPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || {};
    USER_PRESETS = {};
    let migrated = false;
    for (const name of Object.keys(raw)) {
      const p = raw[name];
      const m = migratePresetShape(name, p);
      if (!p || p.schemaVersion !== PRESET_SCHEMA_VERSION) migrated = true;
      USER_PRESETS[name] = m;
    }
    if (migrated) saveUserPresetsToStorage();
  } catch (e) { USER_PRESETS = {}; }
  return USER_PRESETS;
}

function saveUserPresetsToStorage() {
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(USER_PRESETS)); } catch (e) { }
}

function getCurrentCustomConfig() {
  return {
    slope:    parseFloat(document.getElementById('customSlope').value)      || 0.87,
    grpStart: parseInt  (document.getElementById('customGroupStart').value) || 15,
    decay:    parseFloat(document.getElementById('customGroupDecay').value) || 0.82,
    itmPct:   parseFloat(document.getElementById('itmPct').value)           || 15,
    minCash:  parseFloat(document.getElementById('minCash').value)          || 2
  };
}

/**
 * Validate config ranges + simulate payout at a representative field size
 * để cảnh báo phân bổ bất thường (1st% ngoài [10, 50], non-monotonic).
 * Pure — gọi được từ tests.
 */
function validatePresetConfig(cfg) {
  const errors = [];
  const warnings = [];
  const num = v => typeof v === 'number' && isFinite(v);

  if (!num(cfg.slope) || cfg.slope < 0.50 || cfg.slope > 1.20)
    errors.push('slope phải là số trong [0.50, 1.20]');
  if (!num(cfg.decay) || cfg.decay <= 0 || cfg.decay > 1)
    errors.push('decay phải trong khoảng (0, 1]');
  if (!num(cfg.grpStart) || !Number.isInteger(cfg.grpStart) || cfg.grpStart < 1 || cfg.grpStart > 100)
    errors.push('grpStart phải là số nguyên trong [1, 100]');
  if (!num(cfg.itmPct) || cfg.itmPct <= 0 || cfg.itmPct > 50)
    errors.push('ITM% phải trong khoảng (0, 50]');
  if (!num(cfg.minCash) || cfg.minCash < 1 || cfg.minCash > 20)
    errors.push('min cash multiplier phải trong [1, 20]');

  if (errors.length) return { ok: false, errors, warnings };

  try {
    const simField = Math.max(50, Number(cfg.recommendedField) || 200);
    const itmCount = Math.max(3, Math.round(simField * cfg.itmPct / 100));
    const { results } = buildPayout('custom', itmCount, 1e9, 1e7, 10000, cfg.minCash, {
      entries: simField, slope: cfg.slope, grpStart: cfg.grpStart, decay: cfg.decay
    });
    if (!results || !results.length) {
      warnings.push('Không tính được payout mẫu — kiểm tra tham số');
    } else {
      const pct1 = results[0].amount / 1e9;
      if (pct1 < 0.10) warnings.push(`1st chỉ ${(pct1*100).toFixed(1)}% pool ở field ${simField} — quá thấp`);
      if (pct1 > 0.50) warnings.push(`1st tới ${(pct1*100).toFixed(1)}% pool ở field ${simField} — quá cao`);
      for (let i = 0; i < results.length - 1; i++) {
        if (results[i].amount < results[i+1].amount) {
          warnings.push(`Phân bổ không monotonic tại rank ${i+1}`);
          break;
        }
      }
    }
  } catch (e) {
    warnings.push('Simulate lỗi: ' + e.message);
  }

  return { ok: true, errors, warnings };
}

/**
 * Validate metadata (name/description/recommendedField). Pure.
 * existingNames: tên preset khác đã có (dùng check trùng).
 */
function validatePresetMeta(meta, existingNames = []) {
  const errors = [];
  const name = (meta && meta.name || '').trim();
  if (!name) errors.push('Tên preset không được rỗng');
  if (name.length > MAX_PRESET_NAME_LEN) errors.push(`Tên tối đa ${MAX_PRESET_NAME_LEN} ký tự`);
  if (typeof PRESETS !== 'undefined' && PRESETS[name]) errors.push('Tên trùng preset chuẩn, chọn tên khác');
  if (existingNames.includes(name)) errors.push('Tên đã tồn tại');

  if (meta && meta.description && meta.description.length > MAX_PRESET_DESC_LEN)
    errors.push(`Mô tả tối đa ${MAX_PRESET_DESC_LEN} ký tự`);

  if (meta && meta.recommendedField != null && meta.recommendedField !== '') {
    const n = Number(meta.recommendedField);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 10000)
      errors.push('Recommended field phải là số nguyên trong [1, 10000]');
  }
  return { ok: errors.length === 0, errors };
}

function buildPresetObject(name, config, meta) {
  const now = Date.now();
  const rf  = meta && meta.recommendedField;
  return {
    slope:    config.slope,
    grpStart: config.grpStart,
    decay:    config.decay,
    itmPct:   config.itmPct,
    minCash:  config.minCash,
    name,
    description:      ((meta && meta.description) || '').trim(),
    recommendedField: rf == null || rf === '' ? null : Number(rf),
    createdAt:        (meta && meta.createdAt) || now,
    updatedAt:        now,
    createdBy:        ((meta && meta.createdBy) || '').trim(),
    schemaVersion:    PRESET_SCHEMA_VERSION
  };
}

/* ── Preset dialog (create / rename / edit / duplicate) ── */
let presetDialogMode         = null;
let presetDialogOriginalName = null;

function openPresetDialog(mode, originalName = null) {
  const dlg = document.getElementById('presetDialog');
  if (!dlg) return;

  presetDialogMode         = mode;
  presetDialogOriginalName = originalName;

  const existing = originalName ? USER_PRESETS[originalName] : null;
  const titles = {
    create:    'Lưu preset mới',
    rename:    'Đổi tên preset',
    edit:      'Sửa thông tin preset',
    duplicate: 'Nhân bản preset'
  };
  document.getElementById('presetDialogTitle').textContent = titles[mode] || 'Preset';
  document.getElementById('presetDialogErr').innerHTML = '';

  const nameEl  = document.getElementById('presetDialogName');
  const descEl  = document.getElementById('presetDialogDesc');
  const fieldEl = document.getElementById('presetDialogField');
  const byEl    = document.getElementById('presetDialogBy');

  if (mode === 'create') {
    nameEl.value = ''; descEl.value = ''; fieldEl.value = ''; byEl.value = '';
  } else if (mode === 'duplicate') {
    nameEl.value  = originalName ? `${originalName} (copy)`.slice(0, MAX_PRESET_NAME_LEN) : '';
    descEl.value  = existing && existing.description || '';
    fieldEl.value = existing && existing.recommendedField != null ? existing.recommendedField : '';
    byEl.value    = existing && existing.createdBy || '';
  } else {
    nameEl.value  = (existing && existing.name) || originalName || '';
    descEl.value  = existing && existing.description || '';
    fieldEl.value = existing && existing.recommendedField != null ? existing.recommendedField : '';
    byEl.value    = existing && existing.createdBy || '';
  }

  dlg.classList.add('show');
  setTimeout(() => nameEl.focus(), 10);
}

function closePresetDialog() {
  const dlg = document.getElementById('presetDialog');
  if (dlg) dlg.classList.remove('show');
  presetDialogMode = null;
  presetDialogOriginalName = null;
}

function submitPresetDialog() {
  const errEl = document.getElementById('presetDialogErr');
  const meta  = {
    name:             document.getElementById('presetDialogName').value.trim(),
    description:      document.getElementById('presetDialogDesc').value,
    recommendedField: document.getElementById('presetDialogField').value,
    createdBy:        document.getElementById('presetDialogBy').value
  };
  const otherNames = Object.keys(USER_PRESETS).filter(n => n !== presetDialogOriginalName);
  const metaCheck = validatePresetMeta(meta, otherNames);
  if (!metaCheck.ok) {
    errEl.innerHTML = metaCheck.errors.map(e => `• ${escapeHtml(e)}`).join('<br>');
    return;
  }
  const name = meta.name;

  if (presetDialogMode === 'create') {
    if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
      errEl.innerHTML = `• Tối đa ${MAX_USER_PRESETS} preset. Xoá bớt trước.`;
      return;
    }
    const cfg = getCurrentCustomConfig();
    const cfgCheck = validatePresetConfig(cfg);
    if (!cfgCheck.ok) {
      errEl.innerHTML = cfgCheck.errors.map(e => `• ${escapeHtml(e)}`).join('<br>');
      return;
    }
    if (cfgCheck.warnings.length && !confirm('Cảnh báo:\n• ' + cfgCheck.warnings.join('\n• ') + '\n\nVẫn lưu?')) return;
    USER_PRESETS[name] = buildPresetObject(name, cfg, meta);
    showToast(`✓ Đã lưu preset "${name}"`, 'ok-t');

  } else if (presetDialogMode === 'duplicate') {
    const src = USER_PRESETS[presetDialogOriginalName];
    if (!src) { closePresetDialog(); return; }
    if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
      errEl.innerHTML = `• Tối đa ${MAX_USER_PRESETS} preset. Xoá bớt trước.`;
      return;
    }
    USER_PRESETS[name] = buildPresetObject(
      name,
      { slope: src.slope, grpStart: src.grpStart, decay: src.decay, itmPct: src.itmPct, minCash: src.minCash },
      { ...meta, createdAt: Date.now() }
    );
    showToast(`✓ Đã nhân bản thành "${name}"`, 'ok-t');

  } else if (presetDialogMode === 'rename' || presetDialogMode === 'edit') {
    const src = USER_PRESETS[presetDialogOriginalName];
    if (!src) { closePresetDialog(); return; }
    if (name !== presetDialogOriginalName) {
      delete USER_PRESETS[presetDialogOriginalName];
      if (CMP.shadowPreset === 'user:' + presetDialogOriginalName) {
        CMP.shadowPreset = 'user:' + name;
      }
    }
    USER_PRESETS[name] = {
      ...src,
      name,
      description:      (meta.description || '').trim(),
      recommendedField: meta.recommendedField == null || meta.recommendedField === '' ? null : Number(meta.recommendedField),
      createdBy:        (meta.createdBy || '').trim(),
      updatedAt:        Date.now()
    };
    showToast(presetDialogMode === 'rename' ? `✓ Đã đổi tên thành "${name}"` : `✓ Đã cập nhật "${name}"`, 'ok-t');
  }

  saveUserPresetsToStorage();
  renderUserPresets();
  closePresetDialog();
}

function saveUserPresetPrompt()       { openPresetDialog('create'); }
function renameUserPreset(name)       { openPresetDialog('rename', name); }
function duplicateUserPreset(name)    { openPresetDialog('duplicate', name); }
function editUserPreset(name)         { openPresetDialog('edit', name); }

function deleteUserPreset(name) {
  if (!USER_PRESETS[name]) return;
  if (!confirm(`Xoá preset "${name}"?`)) return;
  delete USER_PRESETS[name];
  saveUserPresetsToStorage();
  renderUserPresets();
  if (CMP.shadowPreset === 'user:' + name) {
    CMP.shadowPreset = null;
    applyCompareUI();
    run();
  }
  showToast(`✓ Đã xoá "${name}"`, 'ok-t');
}

function loadUserPresetIntoUI(name) {
  const p = USER_PRESETS[name];
  if (!p) return;
  commitSnapshot('Tải preset: ' + name);

  document.getElementById('customSlope').value      = p.slope;
  document.getElementById('slopeNum').value         = p.slope.toFixed(2);
  document.getElementById('customGroupStart').value = p.grpStart;
  document.getElementById('grpStartNum').value      = p.grpStart;
  document.getElementById('customGroupDecay').value = p.decay;
  document.getElementById('gDecayNum').value        = p.decay.toFixed(2);
  document.getElementById('itmPct').value           = p.itmPct;
  document.getElementById('minCash').value          = p.minCash;

  activatePresetUI('custom', false);
  OVR.clear();
  expandedGroups.clear();
  updateResetBtn();
  renderUserPresets();
  run();
  showToast(`✓ Đã tải preset "${name}"`, 'ok-t');
}

/* ── Export ── */
function buildExportBundle(names) {
  return {
    format:        PRESET_EXPORT_FORMAT,
    schemaVersion: PRESET_SCHEMA_VERSION,
    exportedAt:    new Date().toISOString(),
    presets:       names.map(n => USER_PRESETS[n]).filter(Boolean)
  };
}

function sanitizeFilename(s) {
  return (s || 'preset').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 40) || 'preset';
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSingleUserPreset(name) {
  if (!USER_PRESETS[name]) return;
  downloadJson(`quads-preset-${sanitizeFilename(name)}.json`, buildExportBundle([name]));
  showToast(`✓ Đã xuất "${name}"`, 'ok-t');
}

function exportAllUserPresets() {
  const names = Object.keys(USER_PRESETS);
  if (!names.length) { showToast('Chưa có preset nào để xuất', 'info-t'); return; }
  const ts = new Date().toISOString().slice(0, 10);
  downloadJson(`quads-presets-${ts}.json`, buildExportBundle(names));
  showToast(`✓ Đã xuất ${names.length} preset`, 'ok-t');
}

/* ── Import ── */
function triggerImportPresets() {
  const input = document.getElementById('presetImportInput');
  if (input) { input.value = ''; input.click(); }
}

function handleImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importPresetsFromBundle(JSON.parse(reader.result));
    } catch (e) {
      showToast('✗ File không phải JSON hợp lệ', 'warn-t');
    }
  };
  reader.readAsText(file);
}

function importPresetsFromBundle(bundle) {
  if (!bundle || bundle.format !== PRESET_EXPORT_FORMAT) {
    showToast('✗ Sai format (thiếu quads-payout-preset)', 'warn-t');
    return;
  }
  if (!Array.isArray(bundle.presets) || !bundle.presets.length) {
    showToast('✗ File không có preset nào', 'warn-t');
    return;
  }

  let added = 0, overwritten = 0, skipped = 0, invalid = 0;

  for (const raw of bundle.presets) {
    const p = migratePresetShape(raw && raw.name || '(không tên)', raw);
    if (!validatePresetMeta(p, []).ok || !validatePresetConfig(p).ok) { invalid++; continue; }

    const name = p.name;
    if (USER_PRESETS[name]) {
      if (!confirm(`Preset "${name}" đã tồn tại. Ghi đè?`)) { skipped++; continue; }
      overwritten++;
    } else {
      if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
        showToast(`Đã đạt tối đa ${MAX_USER_PRESETS} preset — dừng nhập`, 'warn-t');
        break;
      }
      added++;
    }
    USER_PRESETS[name] = { ...p, updatedAt: Date.now() };
  }

  saveUserPresetsToStorage();
  renderUserPresets();
  const parts = [];
  if (added)       parts.push(`+${added} mới`);
  if (overwritten) parts.push(`${overwritten} ghi đè`);
  if (skipped)     parts.push(`${skipped} bỏ qua`);
  if (invalid)     parts.push(`${invalid} không hợp lệ`);
  showToast('✓ Nhập: ' + (parts.join(', ') || 'không có thay đổi'), (added || overwritten) ? 'ok-t' : 'info-t');
}

/* ── Render list ── */
function renderUserPresets() {
  const host = document.getElementById('userPresetList');
  if (!host) return;
  const names = Object.keys(USER_PRESETS).sort();
  if (names.length === 0) {
    host.innerHTML = '<div style="font-size:9.5px;color:var(--t4);letter-spacing:.04em;padding:4px 2px">Chưa có preset nào được lưu</div>';
  } else {
    host.innerHTML = names.map(n => {
      const p = USER_PRESETS[n];
      const safe     = escapeHtml(n);
      const descLine = p.description
        ? `<div class="up-desc">${escapeHtml(p.description)}</div>` : '';
      const fieldTag = p.recommendedField
        ? `<span class="up-tag">~${p.recommendedField}</span>` : '';
      return `
        <div class="up-row">
          <button class="up-btn" title="Tải preset này" onclick="loadUserPresetIntoUI('${safe}')">
            <span class="up-name">${safe} ${fieldTag}</span>
            <span class="up-meta">slope ${p.slope} · top${p.grpStart} · decay ${p.decay} · ITM ${p.itmPct}% · ${p.minCash}× min</span>
            ${descLine}
          </button>
          <div class="up-actions">
            <button class="up-act" title="Sửa thông tin"    onclick="editUserPreset('${safe}')">✎</button>
            <button class="up-act" title="Nhân bản"         onclick="duplicateUserPreset('${safe}')">⎘</button>
            <button class="up-act" title="Xuất JSON"        onclick="exportSingleUserPreset('${safe}')">↓</button>
            <button class="up-act up-del" title="Xoá"       onclick="deleteUserPreset('${safe}')">×</button>
          </div>
        </div>`;
    }).join('');
  }
  renderShadowOptions();
}

/* ─── history.js ─── */
/* ═══════════════════════════════════════════════════════
   HISTORY — Undo/Redo with 10-step snapshot stack
   commitSnapshot()  : đẩy state hiện tại vào undoStack (gọi TRƯỚC khi thay đổi)
   performUndo/Redo(): restore + flip stacks
   ═══════════════════════════════════════════════════════ */

const MAX_HISTORY = 10;
const undoStack = [];
const redoStack = [];
let   historyPaused = false;  // block nested snapshots trong lúc restore

function commitSnapshot(label = '') {
  if (historyPaused) return;
  const s = readStateFromDOM();
  s.__label = label;
  // Bỏ qua nếu giống snapshot cuối (tránh no-op commits)
  const last = undoStack[undoStack.length - 1];
  if (last) {
    const a = { ...s }; const b = { ...last };
    delete a.__label; delete b.__label;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
  }
  undoStack.push(s);
  while (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function performUndo() {
  if (undoStack.length === 0) { showToast('Không còn gì để hoàn tác', 'info-t'); return; }
  const current = readStateFromDOM();
  const target  = undoStack.pop();
  redoStack.push(current);
  historyPaused = true;
  try {
    applyStateToDOM(target);
    run();
  } finally { historyPaused = false; }
  updateHistoryButtons();
  showToast(`↶ Hoàn tác${target.__label ? ': ' + target.__label : ''}`, 'info-t');
}

function performRedo() {
  if (redoStack.length === 0) { showToast('Không còn gì để làm lại', 'info-t'); return; }
  const current = readStateFromDOM();
  const target  = redoStack.pop();
  undoStack.push(current);
  historyPaused = true;
  try {
    applyStateToDOM(target);
    run();
  } finally { historyPaused = false; }
  updateHistoryButtons();
  showToast(`↷ Làm lại${target.__label ? ': ' + target.__label : ''}`, 'info-t');
}

function updateHistoryButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) {
    u.classList.toggle('disabled', undoStack.length === 0);
    const last = undoStack[undoStack.length - 1];
    u.title = undoStack.length === 0
      ? 'Không có gì để hoàn tác (Ctrl+Z)'
      : `Hoàn tác: ${last.__label || 'thay đổi gần nhất'} (Ctrl+Z)`;
  }
  if (r) {
    r.classList.toggle('disabled', redoStack.length === 0);
    const last = redoStack[redoStack.length - 1];
    r.title = redoStack.length === 0
      ? 'Không có gì để làm lại (Ctrl+Y)'
      : `Làm lại: ${last.__label || 'thay đổi gần nhất'} (Ctrl+Y)`;
  }
}

/* ─── compare.js ─── */
/* ═══════════════════════════════════════════════════════
   COMPARE — A/B shadow preset comparison
   CMP.on           : compare mode bật/tắt
   CMP.shadowPreset : key của preset so sánh ('wpt'/'wsop'/'apt'/'triton'/'user:<name>')
   Kết quả shadow được tính dựa trên cùng entries/buyin/rake/staff/ITM%/minCash
   → so sánh thuần cấu trúc phân bổ.
   ═══════════════════════════════════════════════════════ */

const CMP = {
  on: false,
  shadowPreset: null,
  results: []
};

function toggleCompareMode() {
  CMP.on = !CMP.on;
  if (CMP.on && !CMP.shadowPreset) {
    // Chọn preset mặc định khác với A
    const fallback = ['wsop', 'wpt', 'apt', 'triton'].find(k => k !== CP) || 'wsop';
    CMP.shadowPreset = fallback;
  }
  commitSnapshot(CMP.on ? 'Bật so sánh A/B' : 'Tắt so sánh A/B');
  applyCompareUI();
  run();
}

function selectShadowPreset(key) {
  if (!key) { CMP.shadowPreset = null; } else { CMP.shadowPreset = key; }
  commitSnapshot('Đổi preset B: ' + (key || 'none'));
  run();
}

function applyCompareUI() {
  const btn = document.getElementById('compareBtn');
  const row = document.getElementById('compareRow');
  if (btn) btn.classList.toggle('active', CMP.on);
  if (row) row.style.display = CMP.on ? 'flex' : 'none';
  renderShadowOptions();
}

function renderShadowOptions() {
  const sel = document.getElementById('shadowSelect');
  if (!sel) return;
  const cur = CMP.shadowPreset || '';
  const userKeys = Object.keys(USER_PRESETS).sort();
  let html = '<option value="">— Chọn preset so sánh —</option>';
  ['wpt','wsop','apt','triton'].forEach(k => {
    if (k === CP) return;  // không so sánh với chính nó
    html += `<option value="${k}"${cur===k?' selected':''}>${k.toUpperCase()}</option>`;
  });
  if (userKeys.length) {
    html += '<optgroup label="Preset của tôi">';
    userKeys.forEach(n => {
      const v = 'user:' + n;
      const safe = n.replace(/"/g, '&quot;').replace(/</g, '&lt;');
      html += `<option value="${v}"${cur===v?' selected':''}>★ ${safe}</option>`;
    });
    html += '</optgroup>';
  }
  sel.innerHTML = html;
}

/**
 * Tính payout theo shadow preset với CÙNG params tài chính như A.
 * Trả về array results (same shape as CResults) hoặc [].
 */
function computeShadowResults() {
  if (!CMP.on || !CMP.shadowPreset || !CResults.length) return [];

  const entries = CEntries;
  const buyin   = gNum('buyin');
  const rf      = CRF;
  const minMult = Math.max(1, gNum('minCash'));
  const itmCount = CResults.length;
  const pool     = CPool;

  const key = CMP.shadowPreset;
  let preset, opts = { entries };

  if (key.startsWith('user:')) {
    const name = key.slice(5);
    const p = USER_PRESETS[name];
    if (!p) return [];
    preset = 'custom';
    opts.slope    = p.slope;
    opts.grpStart = p.grpStart;
    opts.decay    = p.decay;
  } else if (PRESETS[key]) {
    preset = key;
  } else {
    return [];
  }

  try {
    const { results } = buildPayout(preset, itmCount, pool, buyin, rf, minMult, opts);
    return results || [];
  } catch (e) { return []; }
}

function shadowPresetLabel() {
  if (!CMP.shadowPreset) return '';
  if (CMP.shadowPreset.startsWith('user:')) return '★ ' + CMP.shadowPreset.slice(5);
  return CMP.shadowPreset.toUpperCase();
}


/* ═══════════════════════════════════════════════════════
   MAIN — run() orchestrator · DOMContentLoaded init
   ═══════════════════════════════════════════════════════ */

/**
 * Main calculation entry point.
 * Reads all inputs → validates → builds payout → updates all UI panels.
 * Called on any input change, preset switch, or page load.
 */
function run() {
  /* ── Validate trước khi tính ── */
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

  CEntries = entries;

  /* ── Pool calculation ─────────────────────────────────
     Auto mode:   pool = (entries×buyin − rake×entries) × (1 − staff%)
     Direct mode: pool = user input  (rake/staff not factored in)
     ITM count always uses entries × itmPct.
     Min cash    uses buyin × minMult.
     Breakage    = pool − Σ(payouts) — correct in both modes.
  ─────────────────────────────────────────────────────── */
  let pool, totalDeduct;

  if (useDirectPool) {
    pool        = gNum('directPool');
    totalDeduct = 0;
    if (pool <= 0) {
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:28px;font-size:11px">— Nhập prize pool vào ô trên —</td></tr>`;
      setT('stPool', '—'); setT('topPool', '—');
      return;
    }
  } else {
    pool        = (entries * buyin - rake * entries) * (1 - staffPct);
    totalDeduct = (rake * entries) + (entries * buyin - rake * entries) * staffPct;
    if (pool <= 0) {
      document.getElementById('tbody').innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:28px;font-size:11px">— Pool không hợp lệ (rake ≥ buy-in?) —</td></tr>`;
      setT('stPool', fmtVND(0)); setT('topPool', fmtVND(0));
      return;
    }
  }

  const itmCount = Math.max(1, Math.round(entries * itmPct));

  // Clear overrides nếu cấu hình thay đổi đáng kể
  if (CPool !== pool || CRF !== rf || CResults.length !== itmCount) {
    OVR.clear();
    expandedGroups.clear();
    updateResetBtn();
  }
  CPool    = pool;
  CRF      = rf;
  CMinCash = Math.ceil(buyin * minMult / rf) * rf;

  // Update stat panels
  setT('stPool',    fmtVND(pool));
  setT('stDeduct',  useDirectPool ? '—' : fmtVND(totalDeduct));
  setT('stItm',     itmCount + ' người');
  setT('stMin',     fmtVND(CMinCash));
  setT('topPool',   fmtVND(pool));
  setT('topDeduct', useDirectPool ? '—' : fmtVND(totalDeduct));

  // Build payout
  const { results, rawPcts, indivN } = buildPayout(CP, itmCount, pool, buyin, rf, minMult);

  if (CIndivN !== indivN || CResults.length !== results.length) expandedGroups.clear();
  CResults = results;
  CIndivN  = indivN;

  // Top-3 quick cards
  setT('ps1', results[0] ? fmtVND(results[0].amount) : '—');
  setT('ps2', results[1] ? fmtVND(results[1].amount) : '—');
  setT('ps3', results[2] ? fmtVND(results[2].amount) : '—');

  // Distribution weights
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

  // ── Shadow (A/B compare) — tính TRƯỚC renderTable ──
  CMP.results = computeShadowResults();
  updateCompareHeader();

  // Warnings
  const ws = computeWarnings(results, indivN, pool, itmCount, buyin);
  renderWarnings(ws);

  // Table + breakage
  renderTable(results, indivN);
  recalcBreakage();

  // Print metadata
  const now = new Date();
  setT('printTitle', `Quads Hanoi — Payout ${CP.toUpperCase()} · ${entries} người · ${fmtVND(pool)}`);
  setT('printMeta',
    `In ngày ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN')} · ` +
    `ITM: ${itmCount} người (${(itmPct * 100).toFixed(1)}%) · ` +
    `Min Cash: ${fmtVND(CMinCash)} · ` +
    `Làm tròn: ${rf.toLocaleString()}₫`
  );

  saveState();

  // WPT accuracy badge
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
  const th    = document.getElementById('thShadow');
  const thNm  = document.getElementById('thShadowName');
  const dTot  = document.getElementById('cmpDeltaTotal');
  const aLbl  = document.getElementById('cmpALabel');
  const c1    = document.getElementById('top3Card1');
  const c2    = document.getElementById('top3Card2');
  const c3    = document.getElementById('top3Card3');
  const on    = CMP.on && CMP.results.length > 0;

  [c1, c2, c3].forEach(c => c && c.classList.toggle('show-b', on));

  if (aLbl) aLbl.textContent = CP.toUpperCase();

  if (th) {
    th.style.display = on ? '' : 'none';
    if (thNm) thNm.textContent = on ? shadowPresetLabel() : '—';
  }

  // Top-3 B values
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

  // Total delta
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

/* ── Wire commit snapshots vào input/slider changes ──
   Dùng 'change' event (fires on blur for text/number, on release for range)
   để tránh noise từ keystroke.                                               */
function wireInputCommits() {
  const textIds = ['entries','buyin','rake','staff','itmPct','minCash','directPool','slopeNum','grpStartNum','gDecayNum'];
  textIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let valBefore = el.value;
    el.addEventListener('focus', () => { valBefore = el.value; });
    el.addEventListener('change', () => {
      if (el.value !== valBefore) {
        // Snapshot BEFORE current state — tức là state cũ (có valBefore)
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

  // Range sliders: commit on 'change' (fires khi thả chuột hoặc blur bằng bàn phím)
  ['customSlope','customGroupStart','customGroupDecay'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let valBefore = el.value;
    let dirty = false;
    // Capture snapshot value ngay trước lần thay đổi đầu tiên sau khi 'change' vừa fire
    el.addEventListener('input', () => {
      if (!dirty) { /* valBefore đã capture trước đó */ dirty = true; }
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
  if (!(e.ctrlKey || e.metaKey)) return;

  // Ctrl+Shift+Z hoặc Ctrl+Y → Redo
  if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault();
    performRedo();
    return;
  }
  // Ctrl+Z → Undo
  if (e.key === 'z') {
    e.preventDefault();
    performUndo();
    return;
  }
  // Ctrl+Shift+R → Reset overrides (dịch từ Ctrl+Z cũ)
  if (e.key === 'R' && e.shiftKey) {
    e.preventDefault();
    if (OVR.size > 0) { resetOverrides(); showToast('↩ Đã reset tất cả sửa đổi', 'ok-t'); }
    return;
  }
  if (e.key === 'p') { e.preventDefault(); window.print(); }
  if (e.key === 'e') { e.preventDefault(); exportCSV(); }
});

/* ── Initialisation ──────────────────────────────────────
   Quy trình:
   1. loadState() → restore DOM values + preset UI (KHÔNG run())
   2. Nếu không có saved state → set defaults từ preset mặc định
   3. run() một lần duy nhất với đúng state đã restore
   Điều này đảm bảo custom preset luôn dùng đúng slider values.
─────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  loadUserPresets();
  renderUserPresets();

  const hadSavedState = loadState();

  if (!hadSavedState) {
    // First load — set defaults từ preset mặc định (WSOP)
    const p = PRESETS[CP];
    document.getElementById('presetDesc').textContent = p.desc;
    if (p.defaultItm     != null) document.getElementById('itmPct').value  = p.defaultItm;
    if (p.defaultMinCash != null) document.getElementById('minCash').value = p.defaultMinCash;
    // Highlight preset button mặc định
    activatePresetUI(CP, false);
  }

  applyCompareUI();
  wireInputCommits();
  updateHistoryButtons();

  // Luôn run() một lần sau khi toàn bộ state đã sẵn sàng
  run();
});
