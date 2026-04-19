// @ts-check
'use strict';

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
