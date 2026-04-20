// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   TOOLTIP — Custom popover thay browser native title
   - Desktop: hover hiện
   - Touch: tap hiện (chỉ trên element không phải button/input/select
     để không nuốt click nghiệp vụ)
   - Hold native title trong data-tip + chuyển sang aria-label cho a11y
   ═══════════════════════════════════════════════════════ */

const TIP = {
  el:        null,           // DOM của popover
  current:   null,           // element đang hover/active
  hideTimer: null,
  isTouch:   ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
};

function ensureTipEl() {
  if (TIP.el) return TIP.el;
  const d = document.createElement('div');
  d.className = 'tip-pop';
  d.setAttribute('role', 'tooltip');
  document.body.appendChild(d);
  TIP.el = d;
  return d;
}

/* ── Convert tất cả title → data-tip (chạy 1 lần khi load + sau mỗi render bảng) ── */
function convertTitlesToData(root) {
  root = root || document.body;
  const els = root.querySelectorAll('[title]');
  els.forEach(el => {
    const t = el.getAttribute('title');
    if (!t || !t.trim()) return;
    el.setAttribute('data-tip', t);
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', t);
    el.removeAttribute('title');
  });
}

function hideTip() {
  if (TIP.el) TIP.el.classList.remove('show');
  TIP.current = null;
}

function showTipFor(el) {
  if (!el) return;
  const txt = el.getAttribute('data-tip');
  if (!txt) return;
  const pop = ensureTipEl();
  pop.textContent = txt;
  pop.classList.add('show');

  // Vị trí: ưu tiên trên, nếu thiếu chỗ thì dưới. Căn giữa target.
  const r = el.getBoundingClientRect();
  // Dùng visibility trick để đo kích thước popover
  pop.style.left = '0px'; pop.style.top  = '0px';
  const pr = pop.getBoundingClientRect();

  let top = r.top - pr.height - 8;
  if (top < 8) top = r.bottom + 8;
  let left = r.left + r.width / 2 - pr.width / 2;
  left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, left));

  pop.style.left = left + window.scrollX + 'px';
  pop.style.top  = top  + window.scrollY + 'px';

  TIP.current = el;
}

/* ── Tìm element gần nhất có data-tip (kể cả parent) ── */
function findTipTarget(node) {
  while (node && node.nodeType === 1) {
    if (node.getAttribute && node.getAttribute('data-tip')) return node;
    node = node.parentElement;
  }
  return null;
}

/* ── Wire delegation 1 lần ── */
function initTooltips() {
  convertTitlesToData(document.body);

  // Desktop hover
  document.addEventListener('mouseover', ev => {
    if (TIP.isTouch) return; // touch device: bỏ hover (tránh sticky)
    const t = findTipTarget(ev.target);
    if (t && t !== TIP.current) showTipFor(t);
  }, true);
  document.addEventListener('mouseout', ev => {
    if (TIP.isTouch) return;
    const t = findTipTarget(ev.target);
    if (t === TIP.current) hideTip();
  }, true);

  // Touch tap — chỉ cho element không tương tác (label/span/div) hoặc icon ⓘ
  document.addEventListener('click', ev => {
    if (!TIP.isTouch) return;
    const t = findTipTarget(ev.target);
    if (!t) { hideTip(); return; }
    const tag = t.tagName;
    const interactive = (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A');
    if (interactive) return; // không nuốt click nghiệp vụ
    if (TIP.current === t) { hideTip(); return; }
    showTipFor(t);
    // auto hide sau 4s
    clearTimeout(TIP.hideTimer);
    TIP.hideTimer = setTimeout(hideTip, 4000);
  }, true);

  // Esc đóng
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') hideTip();
  });

  // Scroll/resize: đóng để khỏi sai vị trí
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);
}

/* Public: gọi sau khi render bảng để chuyển title mới phát sinh */
function refreshTooltips() {
  convertTitlesToData(document.body);
}

window.addEventListener('DOMContentLoaded', initTooltips);
