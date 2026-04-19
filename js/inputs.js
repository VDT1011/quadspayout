// @ts-check
'use strict';

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
  saveState();
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
  saveState();
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

  const tip = b > 50000
    ? `Pool dư ${fmtVND(b)} — cần phân bổ (bấm "Breakage → #1" để cộng vào rank 1 hoặc giảm rounding factor).`
    : b < -50000
      ? `Tổng giải vượt pool ${fmtVND(Math.abs(b))} — kiểm tra override thủ công hoặc rounding factor.`
      : `Pool cân bằng (chênh lệch ${fmtVND(b)} trong dung sai làm tròn).`;

  ['stBreak', 'topBreak'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = fv;
    el.className = 'sv';
    el.title = tip;
    if (b > 50000)       el.classList.add('brk-pos');
    else if (b < -50000) el.classList.add('brk-neg');
    else                  el.classList.add('brk-zero');
  });

  // Update breakage button state
  const brkBtn = document.getElementById('brkBtn');
  if (brkBtn) {
    const canApply = Math.abs(b) >= CRF && CResults.length > 0;
    brkBtn.classList.toggle('disabled', !canApply);
    brkBtn.title = canApply
      ? (b >= 0 ? `Cộng ${fmtVND(b)} vào rank #1` : `Trừ ${fmtVND(Math.abs(b))} khỏi rank #1`)
      : `Breakage < ${fmtVND(CRF)}`;
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
  saveState();
}

/* ── Breakage → Rank 1 ── */

/** Add all breakage to Rank 1 prize */
function applyBreakageToRank1() {
  if (!CResults.length) return;

  let total = 0;
  CResults.forEach(r => { total += OVR.has(r.rank) ? OVR.get(r.rank) : r.amount; });
  const b = Math.round(CPool - total);

  if (Math.abs(b) < CRF) {
    showToast(`Breakage quá nhỏ (<${fmtVND(CRF)})`, 'info-t');
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
  saveState();
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
