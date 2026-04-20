// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   CONTEXT MENU — Right-click (desktop) / long-press (touch)
   trên hàng bảng payout để quick-edit rank/nhóm.

   Actions:
   - Bump lên / xuống số đẹp (multiple của CRF × 10)
   - = Rank kế (level với rank+1)
   - Khoá giá trị (freeze computed value vào OVR)
   - Xoá sửa rank này (clear OVR)
   - Reset tất cả sửa
   ═══════════════════════════════════════════════════════ */

const CTX = {
  el: null,
  longPressTimer: null,
  lpStartXY: null
};

function ensureCtxEl() {
  if (CTX.el) return CTX.el;
  const d = document.createElement('div');
  d.className = 'ctx-menu';
  d.setAttribute('role', 'menu');
  document.body.appendChild(d);
  CTX.el = d;
  return d;
}

function hideCtx() {
  if (CTX.el) CTX.el.classList.remove('show');
}

/* ── Actions ── */

function ctxAmountFor(rank) {
  return OVR.has(rank) ? OVR.get(rank) : (CResults[rank - 1]?.amount || 0);
}

/** Làm tròn lên/xuống theo bậc (10× CRF). */
function ctxRoundStep() { return CRF * 10; }

function ctxBumpRank(rank, dir) {
  const step = ctxRoundStep();
  const cur  = ctxAmountFor(rank);
  const next = dir > 0
    ? Math.floor(cur / step) * step + step
    : Math.max(0, Math.ceil(cur / step) * step - step);
  if (next === cur) return;
  commitSnapshot(`Bump ${dir > 0 ? '↑' : '↓'} rank #${rank}: ${fmtVND(cur)} → ${fmtVND(next)}`);
  OVR.set(rank, next);
  afterCtxChange();
}

function ctxLevelNext(rank) {
  const nxt = CResults[rank]; // rank+1 in 0-indexed = CResults[rank]
  if (!nxt) return;
  const target = OVR.has(rank + 1) ? OVR.get(rank + 1) : nxt.amount;
  const cur = ctxAmountFor(rank);
  if (target === cur) return;
  commitSnapshot(`= rank kế cho #${rank}: ${fmtVND(cur)} → ${fmtVND(target)}`);
  OVR.set(rank, target);
  afterCtxChange();
}

function ctxLockRank(rank) {
  if (OVR.has(rank)) return;
  const calc = CResults[rank - 1]?.amount || 0;
  commitSnapshot(`Khoá rank #${rank} = ${fmtVND(calc)}`);
  OVR.set(rank, calc);
  afterCtxChange();
}

function ctxClearRank(rank) {
  if (!OVR.has(rank)) return;
  const was = OVR.get(rank);
  commitSnapshot(`Xoá sửa rank #${rank} (${fmtVND(was)})`);
  OVR.delete(rank);
  afterCtxChange();
}

/* ── Group actions: áp dụng cho mọi member trong startRank..endRank ── */
function ctxGroupRanks(sr) {
  const row = CDisplayRows.find(r => r.startRank === sr);
  return row ? row.results.map(r => r.rank) : [];
}

function ctxBumpGroup(sr, dir) {
  const ranks = ctxGroupRanks(sr);
  if (!ranks.length) return;
  const step = ctxRoundStep();
  const cur  = ctxAmountFor(ranks[0]);
  const next = dir > 0
    ? Math.floor(cur / step) * step + step
    : Math.max(0, Math.ceil(cur / step) * step - step);
  if (next === cur) return;
  commitSnapshot(`Bump ${dir > 0 ? '↑' : '↓'} nhóm ${ranks[0]}-${ranks[ranks.length - 1]}: ${fmtVND(next)}`);
  ranks.forEach(r => OVR.set(r, next));
  afterCtxChange();
}

function ctxLockGroup(sr) {
  const ranks = ctxGroupRanks(sr);
  if (!ranks.length) return;
  commitSnapshot(`Khoá nhóm bắt đầu #${sr}`);
  ranks.forEach(r => {
    if (!OVR.has(r)) OVR.set(r, CResults[r - 1]?.amount || 0);
  });
  afterCtxChange();
}

function ctxClearGroup(sr) {
  const ranks = ctxGroupRanks(sr);
  const any = ranks.some(r => OVR.has(r));
  if (!any) return;
  commitSnapshot(`Xoá sửa nhóm bắt đầu #${sr}`);
  ranks.forEach(r => OVR.delete(r));
  afterCtxChange();
}

function afterCtxChange() {
  updateResetBtn();
  renderTable(CResults, CIndivN);
  recalcBreakage();
  saveState();
  hideCtx();
}

/* ── Menu build ── */

function buildMenuHTML(ctx) {
  const items = [];
  const push = (html) => items.push(html);
  const sep = '<div class="ctx-sep"></div>';

  if (ctx.kind === 'individual') {
    const rank = ctx.rank;
    const hasOvr = OVR.has(rank);
    const step = fmtN(ctxRoundStep());
    push(`<button class="ctx-item" role="menuitem" onclick="ctxBumpRank(${rank},1)">
      <span class="ci-ic">▲</span><span>Bump lên (+${step} ₫)</span></button>`);
    push(`<button class="ctx-item" role="menuitem" onclick="ctxBumpRank(${rank},-1)">
      <span class="ci-ic">▼</span><span>Bump xuống (−${step} ₫)</span></button>`);
    if (CResults[rank]) {
      push(`<button class="ctx-item" role="menuitem" onclick="ctxLevelNext(${rank})">
        <span class="ci-ic">=</span><span>= Rank #${rank + 1}</span></button>`);
    }
    push(sep);
    if (!hasOvr) {
      push(`<button class="ctx-item" role="menuitem" onclick="ctxLockRank(${rank})">
        <span class="ci-ic">🔒</span><span>Khoá giá trị hiện tại</span></button>`);
    } else {
      push(`<button class="ctx-item" role="menuitem" onclick="ctxClearRank(${rank})">
        <span class="ci-ic">↺</span><span>Xoá sửa rank này</span></button>`);
    }
  } else if (ctx.kind === 'group') {
    const sr = ctx.sr, er = ctx.er;
    const ranks = ctxGroupRanks(sr);
    const anyOvr = ranks.some(r => OVR.has(r));
    const step = fmtN(ctxRoundStep());
    push(`<div class="ctx-head">Nhóm #${sr}–${er} · ${ranks.length} rank</div>`);
    push(`<button class="ctx-item" role="menuitem" onclick="ctxBumpGroup(${sr},1)">
      <span class="ci-ic">▲</span><span>Bump cả nhóm lên (+${step} ₫)</span></button>`);
    push(`<button class="ctx-item" role="menuitem" onclick="ctxBumpGroup(${sr},-1)">
      <span class="ci-ic">▼</span><span>Bump cả nhóm xuống (−${step} ₫)</span></button>`);
    push(sep);
    if (!anyOvr) {
      push(`<button class="ctx-item" role="menuitem" onclick="ctxLockGroup(${sr})">
        <span class="ci-ic">🔒</span><span>Khoá giá trị nhóm</span></button>`);
    } else {
      push(`<button class="ctx-item" role="menuitem" onclick="ctxClearGroup(${sr})">
        <span class="ci-ic">↺</span><span>Xoá sửa cả nhóm</span></button>`);
    }
  }

  push(sep);
  push(`<button class="ctx-item" role="menuitem" onclick="resetOverrides();hideCtx()">
    <span class="ci-ic">↺</span><span>Reset TẤT CẢ sửa</span></button>`);

  return items.join('');
}

/* ── Trigger ── */

function findRowContext(node) {
  while (node && node.nodeType === 1 && node.tagName !== 'TBODY') {
    if (node.tagName === 'TR') {
      // Group header row
      if (node.classList.contains('grp-header')) {
        // Extract startRank from toggleGroup(N) in first td onclick
        const firstTd = node.querySelector('td');
        if (firstTd) {
          const m = (firstTd.getAttribute('onclick') || '').match(/toggleGroup\((\d+)\)/);
          if (m) {
            const sr = parseInt(m[1], 10);
            const row = (typeof CDisplayRows !== 'undefined') && CDisplayRows.find(r => r.startRank === sr);
            if (row) return { kind: 'group', sr, er: row.endRank };
          }
        }
      }
      // Expanded child row inside group: it uses onAB(this,rank)
      // Individual row: same
      const inp = node.querySelector('input.amt-input[data-rank]');
      if (inp) return { kind: 'individual', rank: parseInt(inp.getAttribute('data-rank'), 10) };
      // Child row has onblur="onAB(this,RANK)" — parse
      const any = node.querySelector('input.amt-input');
      if (any) {
        const ob = any.getAttribute('onblur') || '';
        const m = ob.match(/onAB\(this,(\d+)\)/);
        if (m) return { kind: 'individual', rank: parseInt(m[1], 10) };
      }
      return null;
    }
    node = node.parentElement;
  }
  return null;
}

function showCtxAt(x, y, ctx) {
  const el = ensureCtxEl();
  el.innerHTML = buildMenuHTML(ctx);
  el.classList.add('show');
  // Position with viewport clamping
  el.style.left = '0px'; el.style.top = '0px';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x, top = y;
  if (left + r.width + 8 > vw)  left = vw - r.width - 8;
  if (top  + r.height + 8 > vh) top  = vh - r.height - 8;
  el.style.left = Math.max(4, left) + window.scrollX + 'px';
  el.style.top  = Math.max(4, top)  + window.scrollY + 'px';
}

function initCtxMenu() {
  const tbody = document.getElementById('tbody');
  if (!tbody) return;

  tbody.addEventListener('contextmenu', ev => {
    const ctx = findRowContext(ev.target);
    if (!ctx) return;
    ev.preventDefault();
    showCtxAt(ev.clientX, ev.clientY, ctx);
  });

  // Touch long-press (600ms)
  tbody.addEventListener('touchstart', ev => {
    const t = ev.touches[0];
    if (!t) return;
    CTX.lpStartXY = { x: t.clientX, y: t.clientY, target: ev.target };
    clearTimeout(CTX.longPressTimer);
    CTX.longPressTimer = setTimeout(() => {
      const ctx = findRowContext(CTX.lpStartXY.target);
      if (!ctx) return;
      showCtxAt(CTX.lpStartXY.x, CTX.lpStartXY.y, ctx);
    }, 600);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(e =>
    tbody.addEventListener(e, () => clearTimeout(CTX.longPressTimer), { passive: true }));

  document.addEventListener('click', ev => {
    if (!ev.target.closest('.ctx-menu')) hideCtx();
  }, true);
  document.addEventListener('scroll', hideCtx, true);
  window.addEventListener('resize', hideCtx);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') hideCtx(); });
}

window.addEventListener('DOMContentLoaded', initCtxMenu);

// Expose action fns for inline onclick
window.ctxBumpRank = ctxBumpRank;
window.ctxLevelNext = ctxLevelNext;
window.ctxLockRank = ctxLockRank;
window.ctxClearRank = ctxClearRank;
window.ctxBumpGroup = ctxBumpGroup;
window.ctxLockGroup = ctxLockGroup;
window.ctxClearGroup = ctxClearGroup;
window.hideCtx = hideCtx;
