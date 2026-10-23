// Copy index.html + runtime OCR (Tesseract.js, ONNX Runtime, mô hình PaddleOCR) vào public/ để trang tự chạy, không cần CDN.
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';

const out = 'public';

// Mô hình PP-OCR dạng ONNX (RapidOCR) + bảng ký tự; tải một lần vào models/ (không commit)
const MODELS = {
  'ch_PP-OCRv4_det_infer.onnx': 'https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx',
  'ch_PP-OCRv4_rec_infer.onnx': 'https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx',
  'ppocr_keys_v1.txt': 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/ppocr_keys_v1.txt',
};
mkdirSync('models', { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  if (existsSync(`models/${name}`)) continue;
  console.log('Downloading', name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(`models/${name}`, Buffer.from(await res.arrayBuffer()));
}

rmSync(out, { recursive: true, force: true });
for (const dir of ['core', 'lang', 'ort', 'models']) mkdirSync(`${out}/${dir}`, { recursive: true });

cpSync('src/index.html', `${out}/index.html`);
cpSync('src/paddle.js', `${out}/paddle.js`);
cpSync('node_modules/coi-serviceworker/coi-serviceworker.min.js', `${out}/coi-serviceworker.min.js`);
cpSync('node_modules/tesseract.js/dist/tesseract.min.js', `${out}/tesseract.min.js`);
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
for (const lang of ['eng', 'vie']) {
  cpSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${out}/lang/${lang}.traineddata.gz`);
}
for (const f of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `${out}/ort/${f}`);
}
for (const name of Object.keys(MODELS)) cpSync(`models/${name}`, `${out}/models/${name}`);
console.log('Built ->', out);
