// Chạy: node test/paddle.test.mjs [ảnh.png]
import * as ort from 'onnxruntime-web';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { createPaddleOCR } from '../src/paddle.js';

const [file = 'test/label.png'] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(file));
const rec = ['ch_PP-OCRv4_rec_infer.onnx', 'ppocr_keys_v1.txt'];
const ocr = await createPaddleOCR({
  ort,
  load: (name, as) => (as === 'text' ? readFileSync(`models/${name}`, 'utf8') : readFileSync(`models/${name}`)),
  det: 'ch_PP-OCRv4_det_infer.onnx', rec: rec[0], dict: rec[1], allow: /^[\x20-\x7E°±µΩ×]$/,
});
const r = await ocr.recognize({ data: png.data, width: png.width, height: png.height });
console.log(r.text);
console.log({ conf: Math.round(r.confidence), boxes: r.items.length, ...r.timing });
