# Tesseract.js Camera OCR

Demo đọc chữ từ camera điện thoại bằng [Tesseract.js](https://github.com/naptha/tesseract.js), chạy hoàn toàn trên trình duyệt (không gửi ảnh lên server). Hỗ trợ tiếng Việt và tiếng Anh.

- Chỉ vùng trong khung vàng được đưa vào OCR (cắt, chuyển xám, tăng tương phản).
- Chụp một lần hoặc quét liên tục, đổi camera trước/sau, sao chép kết quả.
- Toàn bộ runtime (worker, lõi WASM, dữ liệu ngôn ngữ) được tự host cùng trang.

## Chạy trên máy

```bash
npm install
npm start
```

`npm start` build vào `public/` rồi mở server HTTPS (chứng chỉ tự ký) ở cổng 8443 và in mã QR cho các IP mạng LAN. Camera trên điện thoại chỉ hoạt động qua HTTPS hoặc `localhost`.

Android qua cáp USB (khi Wi-Fi chặn các máy thấy nhau):

```bash
adb reverse tcp:8443 tcp:8443
# rồi mở https://localhost:8443 trên Chrome của điện thoại
```

## GitHub Pages

Mỗi lần push lên `main`, workflow `.github/workflows/pages.yml` build và deploy `public/` lên GitHub Pages.
