// @ts-check
'use strict';

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
    if (k === CP) return;
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
