# Payout Engine — Quads Hanoi

Tournament Payout Calculator nội bộ cho Quads Hanoi Poker Club. Thay workflow Excel thủ công bằng web app tính cơ cấu giải thưởng theo preset chuẩn (WSOP / APT / Triton / WPT) và preset tuỳ chỉnh.

## Tech stack

Pure HTML + CSS + JS, không build step. Chạy thẳng trong trình duyệt.

- `index.html` — UI
- `styles.css` — design tokens + layout
- `app.js` — logic tính payout, preset, import/export
- `tests.html` — test runner chạy trong trình duyệt

## Chạy local

**Cách 1 — Live Server (khuyến nghị)**
1. Mở thư mục trong VS Code
2. Cài extension *Live Server* (Ritwick Dey)
3. Click chuột phải `index.html` → *Open with Live Server*

**Cách 2 — Python**
```bash
python -m http.server 8000
```
Mở http://localhost:8000

**Cách 3 — Mở file trực tiếp**
Double-click `index.html` (một số tính năng localStorage có thể giới hạn).

## Test

Mở `tests.html` trong trình duyệt — test chạy tự động, xem kết quả on-page.

## Deploy

Kế hoạch: Vercel (auto-deploy từ branch `main`) hoặc GitHub Pages. Chi tiết trong `TODO.md` mục P2.

## Roadmap

Xem [TODO.md](TODO.md). Trọng tâm hiện tại: Preset Builder UI (P1) để staff tự tạo cơ cấu payout mới mà không cần sửa code.

## Changelog

Xem [CHANGELOG.md](CHANGELOG.md).
