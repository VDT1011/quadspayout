// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   STORAGE — Persist / restore UI state to localStorage
   ═══════════════════════════════════════════════════════ */

/** Persist current UI state to localStorage */
function saveState() {
  try {
    const dot = document.getElementById('saveDot');
    if (dot) dot.classList.add('saving');

    const ovr = {};
    OVR.forEach((v, k) => { ovr[k] = v; });

    const s = {
      preset:      CP,
      entries:     document.getElementById('entries').value,
      players:     document.getElementById('players')?.value || '',
      addon:       document.getElementById('addon')?.value || '',
      buyin:       document.getElementById('buyin').value,
      rake:        document.getElementById('rake').value,
      staff:       document.getElementById('staff').value,
      itmPct:      document.getElementById('itmPct').value,
      minCash:     document.getElementById('minCash').value,
      rounding:    document.getElementById('rounding').value,
      poolMode:    document.getElementById('poolMode').checked,
      directPool:  document.getElementById('directPool').value,
      slope:       document.getElementById('customSlope').value,
      grpStart:    document.getElementById('customGroupStart').value,
      decay:       document.getElementById('customGroupDecay').value,
      slopeNum:    document.getElementById('slopeNum').value,
      grpStartNum: document.getElementById('grpStartNum').value,
      gDecayNum:   document.getElementById('gDecayNum').value,
      overrides:   ovr,
      compareOn:    CMP.on,
      shadowPreset: CMP.shadowPreset
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setTimeout(() => dot && dot.classList.remove('saving'), 800);
  } catch (e) { /* silently ignore quota/security errors */ }
}

/**
 * Restore UI state from localStorage.
 * KHÔNG gọi run() — để main.js gọi sau khi mọi thứ đã được set.
 *
 * @returns {boolean} true nếu có saved state, false nếu không
 */
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!s) return false;

    const set = (id, v) => {
      if (v != null && document.getElementById(id))
        document.getElementById(id).value = v;
    };

    set('entries',    s.entries);
    set('players',    s.players);
    set('addon',      s.addon);
    set('buyin',      s.buyin);
    set('rake',       s.rake);
    set('staff',      s.staff);
    set('itmPct',     s.itmPct);
    set('minCash',    s.minCash);
    set('rounding',   s.rounding);
    set('directPool', s.directPool);

    set('customSlope',      s.slope);
    set('customGroupStart', s.grpStart);
    set('customGroupDecay', s.decay);
    set('slopeNum',         s.slopeNum);
    set('grpStartNum',      s.grpStartNum);
    set('gDecayNum',        s.gDecayNum);

    if (s.poolMode) {
      document.getElementById('poolMode').checked = true;
      applyPoolModeUI(true);
    }

    if (s.preset && PRESETS[s.preset]) {
      activatePresetUI(s.preset, false);
    }

    if (s.compareOn != null)    CMP.on = !!s.compareOn;
    if (s.shadowPreset !== undefined) CMP.shadowPreset = s.shadowPreset;

    if (s.overrides && Object.keys(s.overrides).length > 0) {
      PENDING_OVR = s.overrides;
    }

    return true;

  } catch (e) {
    return false;
  }
}
