// @ts-check
'use strict';

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
