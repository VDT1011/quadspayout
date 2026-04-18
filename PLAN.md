# Payout Engine — Kế hoạch cập nhật tiếp theo

Ngày tạo: 2026-04-18
Phạm vi: 6 task kế tiếp, ưu tiên ổn định & maintain dài hạn.
Không bao gồm: export PDF/PNG (bỏ), undo/redo (đã có Ctrl+Z / Ctrl+Y đầy đủ).

---

## Task 1 — Label & tooltip cho breakage dương  [S, ~30 phút]

**Vấn đề**: Sau fix "không auto-cộng breakage vào rank 1", breakage dương là feature (tiền dư của pool) nhưng UI chưa giải thích rõ, staff có thể tưởng là bug.

**Việc làm**:
- Thêm tooltip cạnh `#stBreak` và `#topBreak` (index.html): "Phần dư pool sau khi chia, host quyết định xử lý (dồn rank #1 / giữ cho giải sau / v.v.)".
- Đổi màu `brk-pos` (app.js:1054) sang vàng nhạt thay vì đỏ để không gây hiểu nhầm là lỗi.
- Cạnh nút "Breakage → #1" thêm icon `?` tooltip giải thích hành vi nút.

**Acceptance**: Staff mới nhìn vào hiểu ngay breakage dương là gì, không hỏi.

**File đụng**: `index.html`, `styles.css`, `app.js` (renderBreakage ~1042).

---

## Task 2 — Dùng CRF thay threshold 1000đ hardcoded  [XS, ~15 phút]

**Vấn đề**: `app.js:1062` và `:1102` dùng hằng `1000` để quyết định "breakage đủ lớn để apply". Khi rf=500k (giải cao cấp) hay rf=100 (test) thì số này sai.

**Việc làm**:
- Thay `Math.abs(b) >= 1000` bằng `Math.abs(b) >= CRF` (hoặc `rf` param).
- Thay `< 1,000₫` trong message thành `< ${fmtVND(CRF)}`.

**Acceptance**: Test xanh, không hardcode magic number.

**File đụng**: `app.js` (1062, 1064, 1102, 1103).

---

## Task 3 — Cảnh báo breakage > 2% pool  [S, ~30 phút]

**Vấn đề**: Breakage dương lớn bất thường (>2% pool) là dấu hiệu preset/rf không phù hợp — nên cảnh báo staff xem lại.

**Việc làm**:
- Thêm vào `computeWarnings` (app.js:560): nếu `pool > 0` và `brk / pool > 0.02`, push warning type=`warn` icon=🟡 với message `Breakage ${fmtVND(brk)} (${(brk/pool*100).toFixed(1)}%) cao — xem lại rf hoặc preset.`
- Đặt ở cuối hàm, sau logic safety-net breakage âm.
- Không trigger khi pool mode trực tiếp (user chủ ý).

**Acceptance**: Test fuzz 2000 config hiện tại không fail; thử config rf=500k → thấy warning xuất hiện.

**File đụng**: `app.js` (computeWarnings).

---

## Task 4 — Persist manual overrides (OVR) vào localStorage  [M, ~1h]

**Vấn đề**: `OVR` Map (sửa tay rank amount) không được lưu. Staff sửa 10 rank, reload page, mất hết.

**Việc làm**:
- `saveState` (app.js:1202): thêm `overrides: Array.from(OVR.entries())` vào object `s`.
- `loadState` (app.js:1239): sau khi restore inputs, restore `OVR.clear(); if (s.overrides) s.overrides.forEach(([k,v]) => OVR.set(+k, +v));`.
- Đảm bảo restore chạy **sau** khi `run()` đã build CResults (không thì OVR không có rank để tham chiếu).
- Gọi `saveState` trong `onAB` / `onABGrp` (chỗ commit override) — kiểm tra đã gọi chưa.

**Edge case**: Nếu preset đổi, itmCount giảm → OVR có rank ngoài range → lọc bỏ khi restore.

**Acceptance**: Sửa rank #3 thành 50M, F5, vẫn thấy 50M. Đổi preset → OVR tự xoá (đã có logic clear).

**File đụng**: `app.js` (saveState, loadState).

---

## Task 5 — Thêm JSDoc @ts-check  [M, ~2h]

**Vấn đề**: File `app.js` 2336 dòng không type. Sửa nhầm tên biến IDE không báo. Solo maintain cần safety net nhẹ.

**Việc làm**:
- Thêm `// @ts-check` đầu `app.js`.
- Tạo `jsconfig.json` ở root: `{ "compilerOptions": { "checkJs": true, "target": "es2020", "lib": ["es2020","dom"] } }`.
- Thêm `@typedef` cho các object hay dùng: `PayoutResult` ({rank, pct, amount, floored, spct}), `PresetConfig`, `UserPreset` (v2 schema).
- Fix các warning TS báo (có thể nhiều — làm từng batch, không phải 1 lần).
- KHÔNG chuyển sang `.ts` (tránh build step).

**Acceptance**: VS Code hiện squiggle cho lỗi; không build step mới; tests vẫn chạy trong browser như cũ.

**File đụng**: `app.js`, tạo mới `jsconfig.json`.

---

## Task 6 — Tách app.js thành modules  [L, ~3-4h, LÀM SAU CÙNG]

**Vấn đề**: 2336 dòng trong 1 file. Comment section headers (`/* ─── config.js ─── */`) gợi ý đã có ý định tách. Sau Task 5 JSDoc sẽ dễ tách hơn.

**Việc làm**:
- Tách theo comment marker có sẵn:
  - `config.js` — constants, WPT data, presets, global state (~line 1-250)
  - `payout.js` — buildGroups, wptForEntries, buildPayout, tierInfo, warnings (~250-630)
  - `preset.js` — preset UI, pool mode, slider sync (~630-750)
  - `render.js` — renderTable, renderBreakage, tier rendering (~750-1070)
  - `overrides.js` — OVR handlers, reset, breakage→#1 (~1070-1150)
  - `storage.js` — saveState, loadState, user presets CRUD, import/export (~1150-1550)
  - `compare.js` — A/B compare mode (~1550-1750)
  - `history.js` — undo/redo (~1835-1920)
  - `main.js` — keyboard shortcuts, init (~2280-end)
- Dùng `<script>` tags thông thường (không ES modules — tránh CORS khi mở file://).
- Giữ thứ tự load theo dependency trong `index.html` và `tests.html`.
- Global vars (`CP`, `CResults`, `OVR`, etc.) vẫn global — không refactor scope lần này.

**Acceptance**:
- Tests xanh.
- `index.html` mở bằng file:// vẫn chạy (quan trọng cho dev offline).
- Không thay đổi logic — chỉ chuyển file.

**File đụng**: tạo 9 file .js mới, xoá `app.js` cũ, sửa `index.html` + `tests.html`.

**Rủi ro**: Cao — dễ break. Commit riêng, PR review kỹ. Làm sau Task 1-5 để không đụng nhau.

---

## Thứ tự thực hiện đề xuất

1. **Task 2** (XS) — warm-up, an toàn
2. **Task 3** (S) — tiếp theo 2, cùng scope `computeWarnings`
3. **Task 1** (S) — UI/UX
4. **Task 4** (M) — feature thật, cần QA kỹ
5. **Task 5** (M) — đầu tư dài hạn, dọn trước khi tách file
6. **Task 6** (L) — cuối cùng, commit riêng

Ước tính tổng: **~7-8 giờ làm việc tập trung**, chia 2-3 session.

## Acceptance chung

- Mọi task: test `tests.html` xanh (bao gồm 2000-config stress).
- Manual QA: preset WSOP/APT/Triton/WPT/custom vẫn ra số giống baseline trước khi sửa.
- Commit message scope rõ: `breakage: ...`, `storage: ...`, `refactor: split modules`.
