// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   USER PRESETS — CRUD + import/export preset tuỳ chỉnh
   Key: USER_PRESETS_KEY (localStorage)

   Schema v2 (flat, backwards-compatible với v1):
     { slope, grpStart, decay, itmPct, minCash,       // config
       name, description, recommendedField,           // metadata
       createdAt, updatedAt, createdBy,
       schemaVersion: 2 }
   ═══════════════════════════════════════════════════════ */

const USER_PRESETS_KEY       = 'quads_user_presets_v1';
const USER_PRESETS_BACKUP_KEY = 'quads_user_presets_backup_v1';
const MAX_BACKUPS            = 10;
const MAX_USER_PRESETS       = 20;
const PRESET_SCHEMA_VERSION  = 2;
const PRESET_EXPORT_FORMAT   = 'quads-payout-preset';
const MAX_PRESET_NAME_LEN    = 28;
const MAX_PRESET_DESC_LEN    = 120;

let USER_PRESETS = {};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/**
 * Migrate 1 preset object sang schema hiện tại.
 * Pure — không đụng localStorage. Dùng cho load + import.
 */
function migratePresetShape(name, p) {
  if (p && p.schemaVersion === PRESET_SCHEMA_VERSION) return p;
  const src = p || {};
  const created = src.createdAt || Date.now();
  return {
    slope:    src.slope    ?? 0.87,
    grpStart: src.grpStart ?? 15,
    decay:    src.decay    ?? 0.82,
    itmPct:   src.itmPct   ?? 15,
    minCash:  src.minCash  ?? 2,
    name:             src.name || name,
    description:      src.description      || '',
    recommendedField: src.recommendedField ?? null,
    createdAt:        created,
    updatedAt:        src.updatedAt || created,
    createdBy:        src.createdBy || '',
    schemaVersion:    PRESET_SCHEMA_VERSION
  };
}

function loadUserPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || {};
    USER_PRESETS = {};
    let migrated = false;
    for (const name of Object.keys(raw)) {
      const p = raw[name];
      const m = migratePresetShape(name, p);
      if (!p || p.schemaVersion !== PRESET_SCHEMA_VERSION) migrated = true;
      USER_PRESETS[name] = m;
    }
    if (migrated) saveUserPresetsToStorage();
  } catch (e) { USER_PRESETS = {}; }
  return USER_PRESETS;
}

function saveUserPresetsToStorage() {
  try {
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(USER_PRESETS));
    pushPresetBackup();
  } catch (e) { }
}

/**
 * Snapshot toàn bộ USER_PRESETS vào localStorage backup (rolling, max MAX_BACKUPS).
 * Skip nếu snapshot mới identical với bản gần nhất.
 */
function pushPresetBackup() {
  try {
    const list = loadPresetBackups();
    const payload = JSON.stringify(USER_PRESETS);
    if (list.length && list[0].payload === payload) return; // no-op
    list.unshift({ ts: Date.now(), payload });
    while (list.length > MAX_BACKUPS) list.pop();
    localStorage.setItem(USER_PRESETS_BACKUP_KEY, JSON.stringify(list));
  } catch (e) { }
}

function loadPresetBackups() {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_PRESETS_BACKUP_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function formatBackupTs(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Mở modal chọn backup để khôi phục. */
function openBackupRestore() {
  const list = loadPresetBackups();
  if (!list.length) { showToast('Chưa có backup nào', 'info-t'); return; }

  const existing = document.getElementById('backupRestoreModal');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'backupRestoreModal';
  el.className = 'modal-backdrop show';
  el.innerHTML = `<div class="modal">
    <div class="modal-head">
      <span>Khôi phục backup preset</span>
      <button class="modal-close" onclick="document.getElementById('backupRestoreModal').remove()" title="Đóng">×</button>
    </div>
    <div class="modal-body">
      <div style="font-size:10.5px;color:var(--t3);line-height:1.6;margin-bottom:10px">
        Mỗi lần lưu preset đều được snapshot tự động. Chọn bản để khôi phục — cấu hình hiện tại sẽ bị ghi đè.
      </div>
      <div class="backup-list">
        ${list.map((b, i) => {
          const presets = (() => { try { return JSON.parse(b.payload); } catch (e) { return {}; } })();
          const count = Object.keys(presets).length;
          return `<div class="backup-row">
            <div class="backup-info">
              <div class="backup-ts">${formatBackupTs(b.ts)}${i === 0 ? ' <span style="color:var(--gold);font-size:8.5px">GẦN NHẤT</span>' : ''}</div>
              <div class="backup-meta">${count} preset</div>
            </div>
            <button class="btn-gold" style="padding:5px 12px;font-size:10px" onclick="restorePresetBackup(${i})">Khôi phục</button>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" onclick="document.getElementById('backupRestoreModal').remove()">Đóng</button>
    </div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) el.remove(); });
  document.body.appendChild(el);
}

function restorePresetBackup(index) {
  const list = loadPresetBackups();
  const b = list[index];
  if (!b) return;
  if (!confirm(`Khôi phục backup từ ${formatBackupTs(b.ts)}?\nCấu hình preset hiện tại sẽ bị ghi đè.`)) return;
  try {
    const restored = JSON.parse(b.payload) || {};
    USER_PRESETS = {};
    for (const name of Object.keys(restored)) {
      USER_PRESETS[name] = migratePresetShape(name, restored[name]);
    }
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(USER_PRESETS));
    renderUserPresets();
    const m = document.getElementById('backupRestoreModal');
    if (m) m.remove();
    showToast(`✓ Đã khôi phục ${Object.keys(USER_PRESETS).length} preset`, 'ok-t');
  } catch (e) {
    showToast('✗ Backup lỗi, không đọc được', 'warn-t');
  }
}

function getCurrentCustomConfig() {
  return {
    slope:    parseFloat(document.getElementById('customSlope').value)      || 0.87,
    grpStart: parseInt  (document.getElementById('customGroupStart').value) || 15,
    decay:    parseFloat(document.getElementById('customGroupDecay').value) || 0.82,
    itmPct:   parseFloat(document.getElementById('itmPct').value)           || 15,
    minCash:  parseFloat(document.getElementById('minCash').value)          || 2
  };
}

/**
 * Validate config ranges + simulate payout at a representative field size
 * để cảnh báo phân bổ bất thường (1st% ngoài [10, 50], non-monotonic).
 * Pure — gọi được từ tests.
 */
function validatePresetConfig(cfg) {
  const errors = [];
  const warnings = [];
  const num = v => typeof v === 'number' && isFinite(v);

  if (!num(cfg.slope) || cfg.slope < 0.50 || cfg.slope > 1.20)
    errors.push('slope phải là số trong [0.50, 1.20]');
  if (!num(cfg.decay) || cfg.decay <= 0 || cfg.decay > 1)
    errors.push('decay phải trong khoảng (0, 1]');
  if (!num(cfg.grpStart) || !Number.isInteger(cfg.grpStart) || cfg.grpStart < 1 || cfg.grpStart > 100)
    errors.push('grpStart phải là số nguyên trong [1, 100]');
  if (!num(cfg.itmPct) || cfg.itmPct <= 0 || cfg.itmPct > 50)
    errors.push('ITM% phải trong khoảng (0, 50]');
  if (!num(cfg.minCash) || cfg.minCash < 1 || cfg.minCash > 20)
    errors.push('min cash multiplier phải trong [1, 20]');

  if (errors.length) return { ok: false, errors, warnings };

  try {
    const simField = Math.max(50, Number(cfg.recommendedField) || 200);
    const itmCount = Math.max(3, Math.round(simField * cfg.itmPct / 100));
    const { results } = buildPayout('custom', itmCount, 1e9, 1e7, 10000, cfg.minCash, {
      entries: simField, slope: cfg.slope, grpStart: cfg.grpStart, decay: cfg.decay
    });
    if (!results || !results.length) {
      warnings.push('Không tính được payout mẫu — kiểm tra tham số');
    } else {
      const pct1 = results[0].amount / 1e9;
      if (pct1 < 0.10) warnings.push(`1st chỉ ${(pct1*100).toFixed(1)}% pool ở field ${simField} — quá thấp`);
      if (pct1 > 0.50) warnings.push(`1st tới ${(pct1*100).toFixed(1)}% pool ở field ${simField} — quá cao`);
      for (let i = 0; i < results.length - 1; i++) {
        if (results[i].amount < results[i+1].amount) {
          warnings.push(`Phân bổ không monotonic tại rank ${i+1}`);
          break;
        }
      }
    }
  } catch (e) {
    warnings.push('Simulate lỗi: ' + e.message);
  }

  return { ok: true, errors, warnings };
}

/**
 * Validate metadata (name/description/recommendedField). Pure.
 * existingNames: tên preset khác đã có (dùng check trùng).
 */
function validatePresetMeta(meta, existingNames = []) {
  const errors = [];
  const name = (meta && meta.name || '').trim();
  if (!name) errors.push('Tên preset không được rỗng');
  if (name.length > MAX_PRESET_NAME_LEN) errors.push(`Tên tối đa ${MAX_PRESET_NAME_LEN} ký tự`);
  if (typeof PRESETS !== 'undefined' && PRESETS[name]) errors.push('Tên trùng preset chuẩn, chọn tên khác');
  if (existingNames.includes(name)) errors.push('Tên đã tồn tại');

  if (meta && meta.description && meta.description.length > MAX_PRESET_DESC_LEN)
    errors.push(`Mô tả tối đa ${MAX_PRESET_DESC_LEN} ký tự`);

  if (meta && meta.recommendedField != null && meta.recommendedField !== '') {
    const n = Number(meta.recommendedField);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 10000)
      errors.push('Recommended field phải là số nguyên trong [1, 10000]');
  }
  return { ok: errors.length === 0, errors };
}

function buildPresetObject(name, config, meta) {
  const now = Date.now();
  const rf  = meta && meta.recommendedField;
  return {
    slope:    config.slope,
    grpStart: config.grpStart,
    decay:    config.decay,
    itmPct:   config.itmPct,
    minCash:  config.minCash,
    name,
    description:      ((meta && meta.description) || '').trim(),
    recommendedField: rf == null || rf === '' ? null : Number(rf),
    createdAt:        (meta && meta.createdAt) || now,
    updatedAt:        now,
    createdBy:        ((meta && meta.createdBy) || '').trim(),
    schemaVersion:    PRESET_SCHEMA_VERSION
  };
}

/* ── Preset dialog (create / rename / edit / duplicate) ── */
let presetDialogMode         = null;
let presetDialogOriginalName = null;

function openPresetDialog(mode, originalName = null) {
  const dlg = document.getElementById('presetDialog');
  if (!dlg) return;

  presetDialogMode         = mode;
  presetDialogOriginalName = originalName;

  const existing = originalName ? USER_PRESETS[originalName] : null;
  const titles = {
    create:    'Lưu preset mới',
    rename:    'Đổi tên preset',
    edit:      'Sửa thông tin preset',
    duplicate: 'Nhân bản preset'
  };
  document.getElementById('presetDialogTitle').textContent = titles[mode] || 'Preset';
  document.getElementById('presetDialogErr').innerHTML = '';

  const nameEl  = document.getElementById('presetDialogName');
  const descEl  = document.getElementById('presetDialogDesc');
  const fieldEl = document.getElementById('presetDialogField');
  const byEl    = document.getElementById('presetDialogBy');

  if (mode === 'create') {
    nameEl.value = ''; descEl.value = ''; fieldEl.value = ''; byEl.value = '';
  } else if (mode === 'duplicate') {
    nameEl.value  = originalName ? `${originalName} (copy)`.slice(0, MAX_PRESET_NAME_LEN) : '';
    descEl.value  = existing && existing.description || '';
    fieldEl.value = existing && existing.recommendedField != null ? existing.recommendedField : '';
    byEl.value    = existing && existing.createdBy || '';
  } else {
    nameEl.value  = (existing && existing.name) || originalName || '';
    descEl.value  = existing && existing.description || '';
    fieldEl.value = existing && existing.recommendedField != null ? existing.recommendedField : '';
    byEl.value    = existing && existing.createdBy || '';
  }

  dlg.classList.add('show');
  setTimeout(() => nameEl.focus(), 10);
}

function closePresetDialog() {
  const dlg = document.getElementById('presetDialog');
  if (dlg) dlg.classList.remove('show');
  presetDialogMode = null;
  presetDialogOriginalName = null;
}

function submitPresetDialog() {
  const errEl = document.getElementById('presetDialogErr');
  const meta  = {
    name:             document.getElementById('presetDialogName').value.trim(),
    description:      document.getElementById('presetDialogDesc').value,
    recommendedField: document.getElementById('presetDialogField').value,
    createdBy:        document.getElementById('presetDialogBy').value
  };
  const otherNames = Object.keys(USER_PRESETS).filter(n => n !== presetDialogOriginalName);
  const metaCheck = validatePresetMeta(meta, otherNames);
  if (!metaCheck.ok) {
    errEl.innerHTML = metaCheck.errors.map(e => `• ${escapeHtml(e)}`).join('<br>');
    return;
  }
  const name = meta.name;

  if (presetDialogMode === 'create') {
    if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
      errEl.innerHTML = `• Tối đa ${MAX_USER_PRESETS} preset. Xoá bớt trước.`;
      return;
    }
    const cfg = getCurrentCustomConfig();
    const cfgCheck = validatePresetConfig(cfg);
    if (!cfgCheck.ok) {
      errEl.innerHTML = cfgCheck.errors.map(e => `• ${escapeHtml(e)}`).join('<br>');
      return;
    }
    if (cfgCheck.warnings.length && !confirm('Cảnh báo:\n• ' + cfgCheck.warnings.join('\n• ') + '\n\nVẫn lưu?')) return;
    USER_PRESETS[name] = buildPresetObject(name, cfg, meta);
    showToast(`✓ Đã lưu preset "${name}"`, 'ok-t');

  } else if (presetDialogMode === 'duplicate') {
    const src = USER_PRESETS[presetDialogOriginalName];
    if (!src) { closePresetDialog(); return; }
    if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
      errEl.innerHTML = `• Tối đa ${MAX_USER_PRESETS} preset. Xoá bớt trước.`;
      return;
    }
    USER_PRESETS[name] = buildPresetObject(
      name,
      { slope: src.slope, grpStart: src.grpStart, decay: src.decay, itmPct: src.itmPct, minCash: src.minCash },
      { ...meta, createdAt: Date.now() }
    );
    showToast(`✓ Đã nhân bản thành "${name}"`, 'ok-t');

  } else if (presetDialogMode === 'rename' || presetDialogMode === 'edit') {
    const src = USER_PRESETS[presetDialogOriginalName];
    if (!src) { closePresetDialog(); return; }
    if (name !== presetDialogOriginalName) {
      delete USER_PRESETS[presetDialogOriginalName];
      if (CMP.shadowPreset === 'user:' + presetDialogOriginalName) {
        CMP.shadowPreset = 'user:' + name;
      }
    }
    USER_PRESETS[name] = {
      ...src,
      name,
      description:      (meta.description || '').trim(),
      recommendedField: meta.recommendedField == null || meta.recommendedField === '' ? null : Number(meta.recommendedField),
      createdBy:        (meta.createdBy || '').trim(),
      updatedAt:        Date.now()
    };
    showToast(presetDialogMode === 'rename' ? `✓ Đã đổi tên thành "${name}"` : `✓ Đã cập nhật "${name}"`, 'ok-t');
  }

  saveUserPresetsToStorage();
  renderUserPresets();
  closePresetDialog();
}

function saveUserPresetPrompt()       { openPresetDialog('create'); }
function renameUserPreset(name)       { openPresetDialog('rename', name); }
function duplicateUserPreset(name)    { openPresetDialog('duplicate', name); }
function editUserPreset(name)         { openPresetDialog('edit', name); }

function deleteUserPreset(name) {
  if (!USER_PRESETS[name]) return;
  if (!confirm(`Xoá preset "${name}"?`)) return;
  delete USER_PRESETS[name];
  saveUserPresetsToStorage();
  renderUserPresets();
  if (CMP.shadowPreset === 'user:' + name) {
    CMP.shadowPreset = null;
    applyCompareUI();
    run();
  }
  showToast(`✓ Đã xoá "${name}"`, 'ok-t');
}

function loadUserPresetIntoUI(name) {
  const p = USER_PRESETS[name];
  if (!p) return;
  commitSnapshot('Tải preset: ' + name);

  document.getElementById('customSlope').value      = p.slope;
  document.getElementById('slopeNum').value         = p.slope.toFixed(2);
  document.getElementById('customGroupStart').value = p.grpStart;
  document.getElementById('grpStartNum').value      = p.grpStart;
  document.getElementById('customGroupDecay').value = p.decay;
  document.getElementById('gDecayNum').value        = p.decay.toFixed(2);
  document.getElementById('itmPct').value           = p.itmPct;
  document.getElementById('minCash').value          = p.minCash;

  activatePresetUI('custom', false);
  OVR.clear();
  expandedGroups.clear();
  updateResetBtn();
  renderUserPresets();
  run();
  showToast(`✓ Đã tải preset "${name}"`, 'ok-t');
}

/* ── Export ── */
function buildExportBundle(names) {
  return {
    format:        PRESET_EXPORT_FORMAT,
    schemaVersion: PRESET_SCHEMA_VERSION,
    exportedAt:    new Date().toISOString(),
    presets:       names.map(n => USER_PRESETS[n]).filter(Boolean)
  };
}

function sanitizeFilename(s) {
  return (s || 'preset').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 40) || 'preset';
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSingleUserPreset(name) {
  if (!USER_PRESETS[name]) return;
  downloadJson(`quads-preset-${sanitizeFilename(name)}.json`, buildExportBundle([name]));
  showToast(`✓ Đã xuất "${name}"`, 'ok-t');
}

function exportAllUserPresets() {
  const names = Object.keys(USER_PRESETS);
  if (!names.length) { showToast('Chưa có preset nào để xuất', 'info-t'); return; }
  const ts = new Date().toISOString().slice(0, 10);
  downloadJson(`quads-presets-${ts}.json`, buildExportBundle(names));
  showToast(`✓ Đã xuất ${names.length} preset`, 'ok-t');
}

/* ── Import ── */
function triggerImportPresets() {
  const input = document.getElementById('presetImportInput');
  if (input) { input.value = ''; input.click(); }
}

function handleImportFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importPresetsFromBundle(JSON.parse(reader.result));
    } catch (e) {
      showToast('✗ File không phải JSON hợp lệ', 'warn-t');
    }
  };
  reader.readAsText(file);
}

function importPresetsFromBundle(bundle) {
  if (!bundle || bundle.format !== PRESET_EXPORT_FORMAT) {
    showToast('✗ Sai format (thiếu quads-payout-preset)', 'warn-t');
    return;
  }
  if (!Array.isArray(bundle.presets) || !bundle.presets.length) {
    showToast('✗ File không có preset nào', 'warn-t');
    return;
  }

  let added = 0, overwritten = 0, skipped = 0, invalid = 0;

  for (const raw of bundle.presets) {
    const p = migratePresetShape(raw && raw.name || '(không tên)', raw);
    if (!validatePresetMeta(p, []).ok || !validatePresetConfig(p).ok) { invalid++; continue; }

    const name = p.name;
    if (USER_PRESETS[name]) {
      if (!confirm(`Preset "${name}" đã tồn tại. Ghi đè?`)) { skipped++; continue; }
      overwritten++;
    } else {
      if (Object.keys(USER_PRESETS).length >= MAX_USER_PRESETS) {
        showToast(`Đã đạt tối đa ${MAX_USER_PRESETS} preset — dừng nhập`, 'warn-t');
        break;
      }
      added++;
    }
    USER_PRESETS[name] = { ...p, updatedAt: Date.now() };
  }

  saveUserPresetsToStorage();
  renderUserPresets();
  const parts = [];
  if (added)       parts.push(`+${added} mới`);
  if (overwritten) parts.push(`${overwritten} ghi đè`);
  if (skipped)     parts.push(`${skipped} bỏ qua`);
  if (invalid)     parts.push(`${invalid} không hợp lệ`);
  showToast('✓ Nhập: ' + (parts.join(', ') || 'không có thay đổi'), (added || overwritten) ? 'ok-t' : 'info-t');
}

/* ── Render list ── */
function renderUserPresets() {
  const host = document.getElementById('userPresetList');
  if (!host) return;
  const names = Object.keys(USER_PRESETS).sort();
  if (names.length === 0) {
    host.innerHTML = `<div class="up-empty">
      <div class="up-empty-icon">📁</div>
      <div class="up-empty-title">Chưa có preset nào được lưu</div>
      <div class="up-empty-hint">Chỉnh slope/decay/ITM ở trên rồi bấm <b>💾 Lưu preset...</b> để tạo preset dùng lại sau.</div>
    </div>`;
  } else {
    host.innerHTML = names.map(n => {
      const p = USER_PRESETS[n];
      const safe     = escapeHtml(n);
      const descLine = p.description
        ? `<div class="up-desc">${escapeHtml(p.description)}</div>` : '';
      const fieldTag = p.recommendedField
        ? `<span class="up-tag">~${p.recommendedField}</span>` : '';
      return `
        <div class="up-row">
          <button class="up-btn" title="Tải preset này" onclick="loadUserPresetIntoUI('${safe}')">
            <span class="up-name">${safe} ${fieldTag}</span>
            <span class="up-meta">slope ${p.slope} · top${p.grpStart} · decay ${p.decay} · ITM ${p.itmPct}% · ${p.minCash}× min</span>
            ${descLine}
          </button>
          <div class="up-actions">
            <button class="up-act" title="Sửa thông tin"    onclick="editUserPreset('${safe}')">✎</button>
            <button class="up-act" title="Nhân bản"         onclick="duplicateUserPreset('${safe}')">⎘</button>
            <button class="up-act" title="Xuất JSON"        onclick="exportSingleUserPreset('${safe}')">↓</button>
            <button class="up-act up-del" title="Xoá"       onclick="deleteUserPreset('${safe}')">×</button>
          </div>
        </div>`;
    }).join('');
  }
  renderShadowOptions();
}
