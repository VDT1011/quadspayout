// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   SHARE — Encode/decode state to URL query (?s=...)
   ═══════════════════════════════════════════════════════ */

const SHARE_PARAM   = 's';
const SHARE_VERSION = 1;
const SHARE_MAX_LEN = 6000; // giữ URL dưới ngưỡng an toàn các browser

/* ── Build a compact state snapshot từ DOM ── */
function buildShareState() {
  const ovr = {};
  if (typeof OVR !== 'undefined') OVR.forEach((v, k) => { ovr[k] = v; });

  return {
    v:  SHARE_VERSION,
    p:  (typeof CP !== 'undefined') ? CP : 'wsop',
    e:  document.getElementById('entries').value,
    pl: document.getElementById('players')?.value || '',
    ao: document.getElementById('addon')?.value || '',
    b:  document.getElementById('buyin').value,
    rk: document.getElementById('rake').value,
    sf: document.getElementById('staff').value,
    it: document.getElementById('itmPct').value,
    mc: document.getElementById('minCash').value,
    rd: document.getElementById('rounding').value,
    pm: document.getElementById('poolMode').checked ? 1 : 0,
    dp: document.getElementById('directPool').value,
    sl: document.getElementById('customSlope').value,
    gs: document.getElementById('customGroupStart').value,
    dc: document.getElementById('customGroupDecay').value,
    o:  ovr
  };
}

/* ── Base64 URL-safe ── */
function b64UrlEncode(str) {
  // unicode-safe utf8 → base64
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ── Generate share URL + copy to clipboard ── */
function generateShareUrl() {
  try {
    const state = buildShareState();
    const encoded = b64UrlEncode(JSON.stringify(state));

    if (encoded.length > SHARE_MAX_LEN) {
      showToast(`✗ State quá lớn (${encoded.length} ký tự) — quá nhiều override`, 'warn-t');
      return;
    }

    const url = `${location.origin}${location.pathname}?${SHARE_PARAM}=${encoded}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast('✓ Đã copy link chia sẻ vào clipboard', 'ok-t'),
        () => promptShareUrl(url)
      );
    } else {
      promptShareUrl(url);
    }
  } catch (e) {
    showToast('✗ Tạo link lỗi: ' + e.message, 'warn-t');
  }
}

/* Fallback khi clipboard API không có */
function promptShareUrl(url) {
  prompt('Copy link bên dưới:', url);
}

/* ── Detect & apply ?s= trên URL khi load ── */
/**
 * Trả về true nếu đã apply share state thành công (caller skip loadState normal).
 * Gọi TRƯỚC loadState() trong DOMContentLoaded.
 */
function tryApplySharedState() {
  try {
    const params = new URLSearchParams(location.search);
    const enc = params.get(SHARE_PARAM);
    if (!enc) return false;

    let s;
    try {
      s = JSON.parse(b64UrlDecode(enc));
    } catch {
      showToast('✗ Link chia sẻ hỏng/không hợp lệ', 'warn-t');
      return false;
    }
    if (!s || s.v !== SHARE_VERSION) {
      showToast('✗ Link chia sẻ phiên bản không tương thích', 'warn-t');
      return false;
    }

    if (!confirm('Tải state từ link chia sẻ?\n\nSẽ GHI ĐÈ state đang lưu trên máy. Tiếp tục?')) {
      // user huỷ — xoá query để lần reload sau không hỏi nữa
      cleanShareUrl();
      return false;
    }

    applySharedState(s);
    cleanShareUrl();
    showToast('✓ Đã tải state từ link chia sẻ', 'ok-t');
    return true;
  } catch (e) {
    return false;
  }
}

function applySharedState(s) {
  const set = (id, v) => {
    if (v != null && document.getElementById(id))
      document.getElementById(id).value = v;
  };

  set('entries',          s.e);
  set('players',          s.pl);
  set('addon',            s.ao);
  set('buyin',            s.b);
  set('rake',             s.rk);
  set('staff',            s.sf);
  set('itmPct',           s.it);
  set('minCash',          s.mc);
  set('rounding',         s.rd);
  set('directPool',       s.dp);
  set('customSlope',      s.sl);
  set('customGroupStart', s.gs);
  set('customGroupDecay', s.dc);

  // sync slider→num display
  if (s.sl != null) set('slopeNum', s.sl);
  if (s.gs != null) set('grpStartNum', s.gs);
  if (s.dc != null) set('gDecayNum', s.dc);

  if (s.pm) {
    document.getElementById('poolMode').checked = true;
    if (typeof applyPoolModeUI === 'function') applyPoolModeUI(true);
  }

  if (s.p && typeof PRESETS !== 'undefined' && PRESETS[s.p]) {
    if (typeof activatePresetUI === 'function') activatePresetUI(s.p, false);
  }

  if (s.o && Object.keys(s.o).length > 0) {
    PENDING_OVR = s.o;
  }
}

/** Gỡ ?s=... khỏi URL bar mà không reload */
function cleanShareUrl() {
  try {
    const u = new URL(location.href);
    u.searchParams.delete(SHARE_PARAM);
    history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch (e) {}
}
