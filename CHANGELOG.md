# Changelog

Ghi các thay đổi đáng kể của Payout Engine.

## [Unreleased]

### Added — Workflow Preset đợt 1 (P1)
- Schema user-preset v2: thêm `name`, `description`, `recommendedField`, `updatedAt`, `createdBy`, `schemaVersion`. Migration tự động từ v1 khi load.
- `validatePresetConfig()` + `validatePresetMeta()` — kiểm range (slope, decay, grpStart, ITM%, minCash) và simulate payout để cảnh báo 1st% bất thường hoặc phân bổ non-monotonic trước khi lưu.
- Import/Export JSON: xuất từng preset hoặc toàn bộ (format `quads-payout-preset` v2), nhập từ file với merge + xác nhận ghi đè + báo số lượng added/overwritten/skipped/invalid.
- Preset management: thêm action rename (`✎`), duplicate (`⎘`), export-single (`↓`) bên cạnh nút xoá.
- Modal dialog dùng chung cho create / rename / edit / duplicate thay cho `prompt()`.
- Giới hạn preset tối đa tăng từ 10 → 20.
- Tests cho validation + migration trong `tests.html`.

## [1.2] — 2026-04-18

### Fixed
- Sửa breakage phần A + B (logic tính payout / preset) — chi tiết trong commit history sau khi baseline
- Đồng bộ version label `v1.0` → `v1.2` ở header + footer `index.html` và comment `styles.css`

### Changed
- Split file: tách `styles.css` và `app.js` ra khỏi `index.html` để dễ bảo trì
- Thêm `tests.html` làm test runner tại chỗ

### Added
- `README.md` — hướng dẫn chạy local + tổng quan
- `CHANGELOG.md` — bắt đầu ghi lại thay đổi từ baseline
- `.gitignore`

## [1.0] — baseline cũ

Phiên bản single-file trước khi tách module. Không ghi log chi tiết.
