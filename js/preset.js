// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   PRESET — Preset selection · Pool mode · Slider sync
   ═══════════════════════════════════════════════════════ */

/* ── Pool mode ── */

/**
 * Update pool-mode UI only — không gọi run().
 * Dùng trong restore và từ togglePoolMode().
 */
function applyPoolModeUI(on) {
  document.getElementById('poolDirectWrap').classList.toggle('show', on);
  document.getElementById('rakeWrap').querySelector('input').classList.toggle('inp-disabled', on);
  document.getElementById('staffWrap').querySelector('input').classList.toggle('inp-disabled', on);
}

/** Toggle pool mode (user action) — update UI rồi recalc */
function togglePoolMode() {
  const on = document.getElementById('poolMode').checked;
  commitSnapshot(on ? 'Bật pool trực tiếp' : 'Tắt pool trực tiếp');
  applyPoolModeUI(on);
  run();
}

/* ── Slider ↔ Number input sync ── */

function syncSlider(sId, nId, dec) {
  const v = parseFloat(document.getElementById(sId).value);
  document.getElementById(nId).value = dec > 0 ? v.toFixed(dec) : Math.round(v);
  run();
}

function syncNum(nId, sId, mn, mx, dec) {
  const raw = parseFloat(document.getElementById(nId).value);
  if (isNaN(raw) || raw < mn || raw > mx) return;
  document.getElementById(sId).value = raw;
  run();
}

function clampNum(nId, sId, mn, mx, dec) {
  const raw = parseFloat(document.getElementById(nId).value);
  const v   = isNaN(raw) ? mn : Math.max(mn, Math.min(mx, raw));
  document.getElementById(nId).value = dec > 0 ? v.toFixed(dec) : Math.round(v);
  document.getElementById(sId).value = v;
  run();
}

/* ── Preset selection ── */

/**
 * Activate preset UI only — button highlights, panel open/close,
 * description text, ITM%/minCash defaults — KHÔNG gọi run().
 * Dùng trong loadState() để tránh run() với state chưa đầy đủ.
 *
 * @param {string}  key      - preset key
 * @param {boolean} setDefaults - true khi first-load, false khi restore (ITM% đã saved)
 */
function activatePresetUI(key, setDefaults = true) {
  // Khi switch sang custom, seed sliders từ preset hiện tại (chỉ khi user click, không phải restore)
  if (key === 'custom' && CP !== 'custom' && setDefaults) {
    const CMAP = {
      wpt:    { slope: 0.86, topN: 20, decay: 0.90 },
      wsop:   { slope: 0.87, topN: 20, decay: 0.95 },
      apt:    { slope: 0.82, topN: 20, decay: 0.90 },
      triton: { slope: 0.79, topN: 20, decay: 0.84 }
    };
    const m = CMAP[CP];
    if (m) {
      document.getElementById('customSlope').value      = m.slope;
      document.getElementById('slopeNum').value         = m.slope.toFixed(2);
      document.getElementById('customGroupStart').value = m.topN;
      document.getElementById('grpStartNum').value      = m.topN;
      document.getElementById('customGroupDecay').value = m.decay;
      document.getElementById('gDecayNum').value        = m.decay.toFixed(2);
    }
  }

  CP = key;

  // Button highlights
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const ct = document.getElementById('custToggle');
  ct.classList.remove('active');

  if (key === 'custom') {
    ct.classList.add('active');
    document.getElementById('custPanel').classList.add('open');
  } else {
    const b = document.querySelector(`.preset-btn[data-p="${key}"]`);
    if (b) b.classList.add('active');
    document.getElementById('custPanel').classList.remove('open');
  }

  // Description
  const p = PRESETS[key];
  document.getElementById('presetDesc').textContent = p.desc;

  // Defaults (chỉ set khi first-load, không ghi đè giá trị đã saved)
  if (setDefaults) {
    if (p.defaultItm     != null) document.getElementById('itmPct').value  = p.defaultItm;
    if (p.defaultMinCash != null) document.getElementById('minCash').value = p.defaultMinCash;
  }
}

/**
 * Select preset (user action) — activate UI + clear overrides + run().
 */
function selectPreset(key) {
  commitSnapshot('Đổi preset: ' + CP.toUpperCase() + ' → ' + key.toUpperCase());
  activatePresetUI(key, true);  // setDefaults = true (user đang chọn mới)
  OVR.clear();
  expandedGroups.clear();
  updateResetBtn();
  renderShadowOptions();  // shadow không được trùng preset A
  run();
}
