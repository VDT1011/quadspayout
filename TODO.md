# Payout Engine — TODO

Roadmap nội bộ Quads Hanoi. Ưu tiên: tự động hoá workflow preset thay Excel, deploy web nội bộ, solo maintain.

---

## P0 — Hygiene (nửa ngày)

- [x] Fix version label `v1.0` → `v1.2` trong `index.html` (badge + title đồng bộ)
- [ ] `git init` + commit baseline (`index.html`, `styles.css`, `app.js`, `tests.html`) — cần set git user identity trước
- [ ] Tạo GitHub repo **private**, push lên
- [x] Viết `README.md` ngắn: mô tả, cách chạy local (Live Server), cách deploy
- [x] Tạo `CHANGELOG.md`, ghi fix A+B breakage + split file
- [ ] Chạy `tests.html` — xác nhận toàn bộ test xanh làm baseline *(mở trong browser để verify)*
- [x] Thêm `.gitignore` (node_modules, .vscode, .DS_Store)

## P1 — Workflow Preset (trọng tâm, ~1 tuần)

**Mục tiêu**: thay Excel — staff tạo preset mới từ UI, lưu, dùng lại, chia sẻ.

- [ ] **Preset Builder UI riêng** (tab/modal mới)
  - [ ] Chart realtime: bar/line % pool theo rank khi kéo slope/grpStart/decay
  - [ ] Hiển thị các chỉ số khoá: 1st%, FT weight, 1st/2nd ratio, floor count
  - [ ] Preview song song 3 field size: 100/200/500 entries
- [ ] **Clone-from-standard**: nút "Nhân bản WSOP" / "Nhân bản Triton" → mở builder với config đã điền
- [ ] **So sánh với preset chuẩn** trong builder (tái dùng logic `CMP`)
- [x] **Metadata preset**: `name`, `description`, `recommendedField`, `createdAt`, `createdBy`
  - [x] Mở rộng `user-presets.js` schema (v2), migrate localStorage cũ tự động khi load
- [x] **Import/Export preset `.json`**
  - [x] Nút "Xuất preset" → download `.json` (single hoặc bulk, format `quads-payout-preset`)
  - [x] Nút "Nhập preset" → chọn file, validate schema, merge + cảnh báo trùng tên
- [x] **Validation preset trước khi lưu**: decay ∈ (0,1], range slope/grpStart/ITM%/minCash, simulate 1st% + monotonic → warning
- [x] **Quản lý preset**: danh sách user preset có sửa/xoá/đổi tên/duplicate

## P2 — Deploy nội bộ (1–2 ngày)

- [ ] Chọn host: **Vercel** (đề xuất) hoặc GitHub Pages
- [ ] Deploy `main` branch, auto-deploy khi push
- [ ] Custom domain nội bộ (vd. `payout.quadshanoi.vn` hoặc sub-path)
- [ ] Password gate đơn giản (Vercel Access Password hoặc basic prompt trong JS)
- [ ] `manifest.json` + icon → cài PWA trên iPad floor desk
- [ ] Service worker offline cache (để rớt mạng vẫn tính được)

## P3 — Polish UX cho staff (~1 tuần)

- [ ] **Print/PDF export** poster payout
  - [ ] Print stylesheet A4 riêng
  - [ ] Logo Quads + tên giải + ngày + bảng payout
  - [ ] QR code link share (optional)
- [ ] **Mobile/tablet QA**: check layout iPad landscape + portrait
- [ ] **Tooltip** giải thích mọi input (buy-in, rake, staff fee, ITM%, min cash mult)
- [ ] **Keyboard shortcut** mở rộng
  - [ ] `Ctrl+S` lưu preset custom hiện tại
  - [ ] `Ctrl+E` export CSV
  - [ ] `Ctrl+P` print
  - [ ] `?` mở help overlay list shortcuts
- [ ] **Validation chặt hơn**: cảnh báo khi rake > 15%, ITM > 30%, min cash > 5× buy-in
- [ ] **Empty states** rõ ràng: chưa có preset user, chưa tính payout...

## P4 — Quality of life

- [ ] **Lịch sử giải đã tính** (localStorage): 10–20 giải gần nhất, xem lại/tải lại
- [ ] **Auto-backup preset**: mỗi lần save user preset → tạo bản `.json` local tự động
- [ ] **Compact/Expand toggle** cho bảng payout (xem nhanh vs chi tiết)
- [ ] Snapshot history giới hạn 10 → 20 steps

## P5 — Nice to have (chờ staff phản hồi)

- [ ] Blind structure generator lite
- [ ] Late-reg re-pool preview
- [ ] Bubble/FT freeze (lock payouts đã trao)
- [ ] Multi-currency display (USD/THB phụ, VND chính)

---

## Acceptance chung (cho từng feature)

- Test xanh trong `tests.html`
- Manual QA trên Chrome desktop + iPad Safari
- Không regression: preset WSOP/APT/Triton/WPT chuẩn vẫn ra đúng số
- Commit message tiếng Việt ngắn gọn, scope rõ (vd. `preset-builder: thêm chart realtime`)
