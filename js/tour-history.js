// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   TOUR HISTORY — Lưu các giải đã tính (snapshot inputs)
   Key: TOUR_HISTORY_KEY (localStorage), max MAX_TOUR_HISTORY.
   Mỗi entry là snapshot readStateFromDOM() + metadata hiển thị.
   ═══════════════════════════════════════════════════════ */

const TOUR_HISTORY_KEY = 'quads_payout_history_v1';
const MAX_TOUR_HISTORY = 20;

function loadTourHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(TOUR_HISTORY_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function saveTourHistoryList(list) {
  try { localStorage.setItem(TOUR_HISTORY_KEY, JSON.stringify(list)); } catch (e) { }
}

/** Lưu giải hiện tại vào lịch sử. Gọi từ nút "💾 Lưu giải" ở toolbar. */
function saveTourToHistory() {
  if (!CResults || !CResults.length) {
    showToast('Chưa có giải để lưu', 'info-t');
    return;
  }
  const name = prompt('Tên giải (tuỳ chọn):', defaultTourName());
  if (name === null) return; // huỷ

  const state = readStateFromDOM();
  const entry = {
    id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts:        Date.now(),
    name:      (name || '').trim() || defaultTourName(),
    preset:    CP,
    entries:   CEntries,
    pool:      CPool,
    itmCount:  CResults.length,
    top3:      CResults.slice(0, 3).map(r => OVR.has(r.rank) ? OVR.get(r.rank) : r.amount),
    state
  };

  const list = loadTourHistory();
  list.unshift(entry);
  while (list.length > MAX_TOUR_HISTORY) list.pop();
  saveTourHistoryList(list);
  showToast(`✓ Đã lưu "${entry.name}" vào lịch sử`, 'ok-t');
}

function defaultTourName() {
  const presetLbl = (CP || '').toUpperCase();
  const ent = CEntries || 0;
  const d = new Date();
  const dateStr = d.toLocaleDateString('vi-VN');
  return `${presetLbl} · ${ent} người · ${dateStr}`;
}

function deleteTourEntry(id) {
  if (!confirm('Xoá giải này khỏi lịch sử?')) return;
  const list = loadTourHistory().filter(e => e.id !== id);
  saveTourHistoryList(list);
  renderTourHistoryList();
  showToast('✓ Đã xoá', 'ok-t');
}

function restoreTour(id) {
  const entry = loadTourHistory().find(e => e.id === id);
  if (!entry || !entry.state) return;
  if (!confirm(`Khôi phục "${entry.name}"?\nCấu hình hiện tại sẽ bị thay thế.`)) return;

  commitSnapshot('Khôi phục giải: ' + entry.name);
  applyStateToDOM(entry.state);
  const m = document.getElementById('tourHistoryModal');
  if (m) m.remove();
  run();
  showToast(`✓ Đã khôi phục "${entry.name}"`, 'ok-t');
}

/** Mở modal lịch sử giải. */
function openTourHistory() {
  const existing = document.getElementById('tourHistoryModal');
  if (existing) { existing.remove(); return; }

  const el = document.createElement('div');
  el.id = 'tourHistoryModal';
  el.className = 'modal-backdrop show';
  el.innerHTML = `<div class="modal" style="max-width:540px">
    <div class="modal-head">
      <span>Lịch sử giải đã tính</span>
      <button class="modal-close" onclick="document.getElementById('tourHistoryModal').remove()" title="Đóng">×</button>
    </div>
    <div class="modal-body">
      <div id="tourHistoryBody"></div>
    </div>
    <div class="modal-foot">
      <button class="btn-ghost" onclick="document.getElementById('tourHistoryModal').remove()">Đóng</button>
    </div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) el.remove(); });
  document.body.appendChild(el);
  renderTourHistoryList();
}

function renderTourHistoryList() {
  const host = document.getElementById('tourHistoryBody');
  if (!host) return;
  const list = loadTourHistory();
  if (!list.length) {
    host.innerHTML = `<div class="tbody-empty" style="padding:24px 12px">
      <div class="empty-icon">📜</div>
      <div class="empty-title">Chưa có giải nào được lưu</div>
      <div class="empty-hint">Tính xong giải → bấm <b>💾 Lưu giải</b> ở toolbar bảng để lưu vào đây. Tối đa ${MAX_TOUR_HISTORY} giải gần nhất.</div>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="tour-hist-list">${list.map(e => {
    const d = new Date(e.ts);
    const tsStr = d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const topStr = (e.top3 || []).map((v, i) => `<span class="th-r${i+1}">#${i+1} ${fmtVND(v)}</span>`).join('');
    const name = (e.name || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    return `<div class="tour-hist-row">
      <div class="tour-hist-info">
        <div class="tour-hist-name">${name}</div>
        <div class="tour-hist-meta">
          <span class="th-tag">${(e.preset || '').toUpperCase()}</span>
          <span>${e.entries} người</span>
          <span>${fmtVND(e.pool)}</span>
          <span style="color:var(--t4)">${tsStr}</span>
        </div>
        <div class="tour-hist-top">${topStr}</div>
      </div>
      <div class="tour-hist-actions">
        <button class="btn-gold" style="padding:5px 10px;font-size:10px" onclick="restoreTour('${e.id}')">Khôi phục</button>
        <button class="up-act up-del" onclick="deleteTourEntry('${e.id}')" title="Xoá">×</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}
