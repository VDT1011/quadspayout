// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   ENGINE — Payout Calculation Core
   · WPT dynamic interpolation
   · buildGroups
   · buildPayout  (two-phase floor, monotonic enforcement)
   · tierInfo
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
