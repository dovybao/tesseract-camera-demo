import { createWorker } from 'tesseract.js';
const [file = 'test/label.png'] = process.argv.slice(2);
const w = await createWorker('eng', 1, { langPath: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int', cachePath: '/tmp/claude-1000/tess-cache' });
const t0 = Date.now();
const { data } = await w.recognize(file);
console.log(data.text.trim());
console.log({ conf: Math.round(data.confidence), ms: Date.now() - t0 });
await w.terminate();
