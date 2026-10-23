// Copy index.html + tesseract.js runtime (worker, wasm core, language data) into public/ so the phone needs no internet.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const out = 'public';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });

cpSync('src/index.html', `${out}/index.html`);
cpSync('node_modules/tesseract.js/dist/tesseract.min.js', `${out}/tesseract.min.js`);
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
for (const lang of ['eng', 'vie']) {
  cpSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${out}/lang/${lang}.traineddata.gz`);
}
console.log('Built ->', out);
