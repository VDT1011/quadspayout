// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   WARNINGS — Per-preset thresholds + compute/render cảnh báo
   ═══════════════════════════════════════════════════════ */

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

  /* ── Input-level sanity checks ── */
  const poolModeOn = document.getElementById('poolMode').checked;
  if (!poolModeOn && buyin > 0) {
    const rakeVal = parseFloat(document.getElementById('rake').value) || 0;
    const rakePct = rakeVal / buyin;
    if (rakePct > 0.15)
      ws.push({ type: 'warn', ic: '🟡',
        msg: `Rake ${(rakePct*100).toFixed(1)}% buy-in — Cao bất thường (>15%). Kiểm tra lại số tiền rake.` });
  }
  if (itmCount > 0 && CEntries > 0) {
    const itmPctActual = itmCount / CEntries;
    if (itmPctActual > 0.30)
      ws.push({ type: 'warn', ic: '🟡',
        msg: `ITM ${(itmPctActual*100).toFixed(1)}% — Rất cao (>30%). Payout sẽ bị dàn trải.` });
  }
  if (buyin > 0 && CMinCash > buyin * 5)
    ws.push({ type: 'warn', ic: '🟡',
      msg: `Min Cash ${fmtVND(CMinCash)} vượt 5× buy-in — Nhiều rank sẽ bị bump lên floor, cấu trúc payout méo.` });

  /* ── Direct pool mode ── */
  if (poolModeOn)
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
    else if (Math.abs(brk) > pool * 0.02)
      ws.push({ type: 'warn', ic: '🟡',
        msg: `Breakage ${fmtVND(brk)} vượt 2% pool (${(brk / pool * 100).toFixed(1)}%) — cân nhắc giảm rounding factor hoặc phân bổ lại.` });
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
