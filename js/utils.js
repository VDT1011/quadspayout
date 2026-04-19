// @ts-check
'use strict';

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

/**
 * Render empty state vào <tbody>.
 * @param {string} icon  SVG/emoji nhỏ
 * @param {string} title Dòng tiêu đề
 * @param {string} hint  Gợi ý hành động
 */
function renderTbodyEmpty(icon, title, hint) {
  const tbody = document.getElementById('tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" class="tbody-empty">
    <div class="empty-icon">${icon}</div>
    <div class="empty-title">${title}</div>
    ${hint ? `<div class="empty-hint">${hint}</div>` : ''}
  </td></tr>`;
}

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
