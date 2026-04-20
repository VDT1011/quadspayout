// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   BACKUP — Full app export / import (toàn bộ localStorage)
   ═══════════════════════════════════════════════════════ */

const BACKUP_FORMAT  = 'quads-payout-full-backup';
const BACKUP_VERSION = 1;

/** Tất cả key localStorage app dùng — phải giữ đồng bộ với các module. */
const BACKUP_KEYS = [
  STORAGE_KEY,                // state hiện tại (preset, params, override)
  COMPACT_KEY,                // bật/tắt compact view
  TOUR_HISTORY_KEY,           // lịch sử giải đã lưu
  USER_PRESETS_KEY,           // preset user tự tạo
  USER_PRESETS_BACKUP_KEY,    // auto-backup preset
  'quads_payout_theme_v1'     // light/dark (THEME_KEY trong main.js)
];

/* ── Export ── */
function exportFullBackup() {
  const data = {};
  let count = 0;
  for (const key of BACKUP_KEYS) {
    const v = localStorage.getItem(key);
    if (v != null) { data[key] = v; count++; }
  }

  const bundle = {
    format:     BACKUP_FORMAT,
    version:    BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: 'v1.2',
    data
  };

  const ts = new Date().toISOString().slice(0, 10);
  downloadJson(`quads-payout-backup-${ts}.json`, bundle);
  showToast(`✓ Đã xuất backup (${count} mục)`, 'ok-t');
}

/* ── Import ── */
function triggerImportFullBackup() {
  const input = document.getElementById('fullBackupInput');
  if (input) { input.value = ''; input.click(); }
}

function handleImportFullBackup(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyFullBackup(JSON.parse(reader.result));
    } catch (e) {
      showToast('✗ File không phải JSON hợp lệ', 'warn-t');
    }
  };
  reader.readAsText(file);
}

function applyFullBackup(bundle) {
  if (!bundle || bundle.format !== BACKUP_FORMAT) {
    showToast('✗ Sai format (cần quads-payout-full-backup)', 'warn-t');
    return;
  }
  if (!bundle.data || typeof bundle.data !== 'object') {
    showToast('✗ Backup rỗng hoặc hỏng', 'warn-t');
    return;
  }

  const validKeys = Object.keys(bundle.data).filter(k => BACKUP_KEYS.includes(k));
  if (!validKeys.length) {
    showToast('✗ Backup không chứa dữ liệu app', 'warn-t');
    return;
  }

  const ts = bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString('vi-VN') : '?';
  const msg = `Khôi phục backup từ ${ts}?\n\n` +
              `Sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại (${validKeys.length} mục):\n` +
              validKeys.map(k => `  • ${k}`).join('\n') +
              `\n\nKhông thể hoàn tác. Tiếp tục?`;
  if (!confirm(msg)) return;

  for (const key of BACKUP_KEYS) {
    if (bundle.data[key] != null) {
      localStorage.setItem(key, bundle.data[key]);
    } else {
      localStorage.removeItem(key);
    }
  }

  showToast('✓ Đã khôi phục — đang reload...', 'ok-t');
  setTimeout(() => location.reload(), 600);
}
