// @ts-check
'use strict';

/* ═══════════════════════════════════════════════════════
   HISTORY — Undo/Redo snapshot stack
   commitSnapshot()  : đẩy state hiện tại vào undoStack (gọi TRƯỚC khi thay đổi)
   performUndo/Redo(): restore + flip stacks
   ═══════════════════════════════════════════════════════ */

const MAX_HISTORY = 20;
const undoStack = [];
const redoStack = [];
let   historyPaused = false;

function commitSnapshot(label = '') {
  if (historyPaused) return;
  const s = readStateFromDOM();
  s.__label = label;
  const last = undoStack[undoStack.length - 1];
  if (last) {
    const a = { ...s }; const b = { ...last };
    delete a.__label; delete b.__label;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
  }
  undoStack.push(s);
  while (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function performUndo() {
  if (undoStack.length === 0) { showToast('Không còn gì để hoàn tác', 'info-t'); return; }
  const current = readStateFromDOM();
  const target  = undoStack.pop();
  redoStack.push(current);
  historyPaused = true;
  try {
    applyStateToDOM(target);
    run();
  } finally { historyPaused = false; }
  updateHistoryButtons();
  showToast(`↶ Hoàn tác${target.__label ? ': ' + target.__label : ''}`, 'info-t');
}

function performRedo() {
  if (redoStack.length === 0) { showToast('Không còn gì để làm lại', 'info-t'); return; }
  const current = readStateFromDOM();
  const target  = redoStack.pop();
  undoStack.push(current);
  historyPaused = true;
  try {
    applyStateToDOM(target);
    run();
  } finally { historyPaused = false; }
  updateHistoryButtons();
  showToast(`↷ Làm lại${target.__label ? ': ' + target.__label : ''}`, 'info-t');
}

function updateHistoryButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) {
    u.classList.toggle('disabled', undoStack.length === 0);
    const last = undoStack[undoStack.length - 1];
    u.title = undoStack.length === 0
      ? 'Không có gì để hoàn tác (Ctrl+Z)'
      : `Hoàn tác: ${last.__label || 'thay đổi gần nhất'} (Ctrl+Z)`;
  }
  if (r) {
    r.classList.toggle('disabled', redoStack.length === 0);
    const last = redoStack[redoStack.length - 1];
    r.title = redoStack.length === 0
      ? 'Không có gì để làm lại (Ctrl+Y)'
      : `Làm lại: ${last.__label || 'thay đổi gần nhất'} (Ctrl+Y)`;
  }
}
