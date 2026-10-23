# Camera OCR: PaddleOCR vs Tesseract.js

Demo đọc chữ từ camera điện thoại, chạy hoàn toàn trên trình duyệt (không gửi ảnh lên server). Có hai bộ nhận dạng để so sánh:

- **PaddleOCR** (mặc định): mô hình PP-OCRv4 dạng ONNX ([RapidOCR](https://huggingface.co/SWHL/RapidOCR)) chạy bằng [onnxruntime-web](https://onnxruntime.ai/). Tự tìm vùng chữ rồi đọc từng dòng, tốt hơn hẳn với ảnh chụp tem sản phẩm. Chỉ giữ ký tự Latin/số/ký hiệu. Lần đầu tải khoảng 30 MB.
- **Tesseract.js**: nhẹ hơn, hợp với tài liệu phẳng; có thêm tiếng Việt.

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

## Thử pipeline PaddleOCR trên Node

```bash
npm run build                          # tải mô hình vào models/ nếu chưa có
node test/paddle.test.mjs anh-tem.png  # in chữ đọc được + thời gian
node test/tesseract.test.mjs anh-tem.png
```

## GitHub Pages

GitHub Pages không cho đặt header COOP/COEP, nên trang dùng [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) để bật cross-origin isolation, cho ONNX Runtime chạy đa luồng (trang tự tải lại một lần ở lần mở đầu tiên).


Mỗi lần push lên `main`, workflow `.github/workflows/pages.yml` build và deploy `public/` lên GitHub Pages.
