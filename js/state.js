// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   STATE — Single-source-of-truth helpers
   readStateFromDOM()  : đọc toàn bộ UI state thành 1 object
   applyStateToDOM()   : apply object về DOM (không gọi run)
   Dùng cho undo/redo, A/B compare, named presets.
   ═══════════════════════════════════════════════════════ */

function readStateFromDOM() {
  const g = id => document.getElementById(id);
  const ovr = {};
  OVR.forEach((v, k) => { ovr[k] = v; });
  return {
    preset:      CP,
    entries:     g('entries').value,
    players:     g('players')?.value || '',
    addon:       g('addon')?.value || '',
    buyin:       g('buyin').value,
    rake:        g('rake').value,
    staff:       g('staff').value,
    itmPct:      g('itmPct').value,
    minCash:     g('minCash').value,
    rounding:    g('rounding').value,
    poolMode:    g('poolMode').checked,
    directPool:  g('directPool').value,
    slope:       g('customSlope').value,
    grpStart:    g('customGroupStart').value,
    decay:       g('customGroupDecay').value,
    slopeNum:    g('slopeNum').value,
    grpStartNum: g('grpStartNum').value,
    gDecayNum:   g('gDecayNum').value,
    overrides:   ovr,
    shadowPreset: CMP.shadowPreset,
    compareOn:    CMP.on
  };
}

function applyStateToDOM(s) {
  const set = (id, v) => { if (v != null && document.getElementById(id)) document.getElementById(id).value = v; };

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

  if (s.poolMode != null) {
    document.getElementById('poolMode').checked = !!s.poolMode;
    applyPoolModeUI(!!s.poolMode);
  }

  if (s.preset && PRESETS[s.preset]) activatePresetUI(s.preset, false);

  OVR.clear();
  if (s.overrides) {
    Object.keys(s.overrides).forEach(k => OVR.set(parseInt(k, 10), s.overrides[k]));
  }
  expandedGroups.clear();
  updateResetBtn();

  if (s.compareOn != null) CMP.on = !!s.compareOn;
  if (s.shadowPreset !== undefined) CMP.shadowPreset = s.shadowPreset;
  applyCompareUI();
}
