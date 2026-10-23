// PaddleOCR (PP-OCR ONNX) chạy bằng onnxruntime-web. Không phụ thuộc canvas/DOM để test được trên Node.
// Ảnh vào là { data: RGBA Uint8ClampedArray, width, height } (giống ImageData).

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

export async function createPaddleOCR({ ort, load, det, rec, dict, maxSide = 960, recHeight = 48, allow = null }) {
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  const [detSession, recSession, dictText] = await Promise.all([
    ort.InferenceSession.create(await load(det), opts),
    ort.InferenceSession.create(await load(rec), opts),
    load(dict, 'text'),
  ]);
  // CTC: index 0 là blank, cuối cùng là dấu cách (use_space_char)
  const chars = ['', ...dictText.split(/\r?\n/).filter((l) => l.length), ' '];
  // Chỉ chọn trong các ký tự cho phép (vd. chữ Latin) khi bảng chữ của mô hình lớn hơn nhu cầu,
  // để chữ Hán trông giống không "cướp" mất chữ Latin đúng.
  const cand = chars.map((c, i) => i).filter((i) => i === 0 || !allow || allow.test(chars[i]));

  async function detect(img) {
    let s = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(32, Math.round((img.width * s) / 32) * 32);
    const h = Math.max(32, Math.round((img.height * s) / 32) * 32);
    const small = resize(img, w, h);
    // Paddle huấn luyện trên ảnh BGR (cv2), nên đảo kênh trước khi chuẩn hóa
    const input = new Float32Array(3 * w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      for (let c = 0; c < 3; c++) {
        input[c * w * h + i] = (small.data[p + (2 - c)] / 255 - DET_MEAN[c]) / DET_STD[c];
      }
    }
    const out = await detSession.run({ [detSession.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) });
    const prob = out[detSession.outputNames[0]].data;
    return boxesFromMap(prob, w, h, img.width / w, img.height / h, img.width, img.height);
  }

  // Đọc các dòng chữ; batch > 1 gom các dòng dài gần nhau (đệm 0 như Paddle), nhưng đo thực tế batch = 1 nhanh hơn trên WASM
  async function recognizeBoxes(img, boxes, batch = 1) {
    const widthOf = (b) => Math.max(recHeight, Math.min(1600, Math.ceil((recHeight * (b.x1 - b.x0)) / (b.y1 - b.y0))));
    const order = boxes.map((b, i) => i).sort((a, b) => widthOf(boxes[a]) - widthOf(boxes[b]));
    const results = new Array(boxes.length);
    for (let s = 0; s < order.length; s += batch) {
      const ids = order.slice(s, s + batch);
      const W = Math.max(...ids.map((i) => widthOf(boxes[i])));
      const plane = recHeight * W, input = new Float32Array(ids.length * 3 * plane);
      ids.forEach((id, j) => {
        const w = widthOf(boxes[id]), crop = resize(img, w, recHeight, boxes[id]);
        for (let y = 0; y < recHeight; y++) {
          for (let x = 0; x < w; x++) {
            const p = (y * w + x) * 4, o = j * 3 * plane + y * W + x;
            for (let c = 0; c < 3; c++) input[o + c * plane] = (crop.data[p + (2 - c)] / 255 - 0.5) / 0.5;
          }
        }
      });
      const out = await recSession.run({ [recSession.inputNames[0]]: new ort.Tensor('float32', input, [ids.length, 3, recHeight, W]) });
      const t = out[recSession.outputNames[0]];
      const [, steps, classes] = t.dims;
      ids.forEach((id, j) => { results[id] = decode(t.data, j * steps * classes, steps, classes); });
    }
    return results;
  }

  // CTC greedy: lấy ký tự xác suất cao nhất mỗi bước, bỏ blank và ký tự lặp liền nhau
  function decode(data, offset, steps, classes) {
    let text = '', last = 0, sum = 0, count = 0;
    for (let s = 0; s < steps; s++) {
      let best = 0, bestP = -Infinity;
      for (const k of cand) {
        if (k >= classes) break;
        const v = data[offset + s * classes + k];
        if (v > bestP) { bestP = v; best = k; }
      }
      if (best !== 0 && best !== last) { text += chars[best] ?? ''; sum += bestP; count++; }
      last = best;
    }
    return { text: text.trim(), score: count ? sum / count : 0 };
  }

  async function recognize(img) {
    const t0 = Date.now();
    const boxes = await detect(img);
    const t1 = Date.now();
    const rec = await recognizeBoxes(img, boxes);
    const items = boxes.map((b, i) => ({ ...b, ...rec[i] })).filter((it) => it.text && it.score > 0.5);
    const lines = groupLines(items);
    const score = items.length ? items.reduce((a, i) => a + i.score, 0) / items.length : 0;
    return {
      text: lines.map((l) => l.map((i) => i.text).join('  ')).join('\n'),
      confidence: score * 100,
      items,
      timing: { det: t1 - t0, rec: Date.now() - t1 },
    };
  }

  return { recognize, detect };
}

// Ngưỡng hóa bản đồ xác suất, tìm các vùng liền nhau, mở rộng (unclip) rồi đổi về tọa độ ảnh gốc.
// Dùng hộp thẳng trục: tem sản phẩm hầu hết là chữ nằm ngang.
function boxesFromMap(prob, w, h, sx, sy, W, H, thresh = 0.3, boxThresh = 0.6, unclip = 1.6) {
  const label = new Int32Array(w * h);
  const boxes = [];
  const stack = [];
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] || prob[start] < thresh) continue;
    id++;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, n = 0;
    label[start] = id; stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p - x) / w;
      sum += prob[p]; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || label[q] || prob[q] < thresh) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        label[q] = id; stack.push(q);
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (Math.min(bw, bh) < 3 || sum / n < boxThresh) continue;
    const d = (bw * bh * unclip) / (2 * (bw + bh));
    boxes.push({
      x0: Math.max(0, Math.floor((x0 - d) * sx)),
      y0: Math.max(0, Math.floor((y0 - d) * sy)),
      x1: Math.min(W, Math.ceil((x1 + 1 + d) * sx)),
      y1: Math.min(H, Math.ceil((y1 + 1 + d) * sy)),
      detScore: sum / n,
    });
  }
  return boxes;
}

// Gom các hộp có cùng hàng (chồng nhau theo chiều dọc) thành dòng, đọc trái sang phải.
function groupLines(items) {
  const sorted = [...items].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const lines = [];
  for (const it of sorted) {
    const cy = (it.y0 + it.y1) / 2, h = it.y1 - it.y0;
    // So với tâm dòng (không nới rộng dòng), để chữ to/nhỏ cạnh nhau không kéo các dòng dính lại
    const line = lines.find((l) => Math.abs(cy - l.cy) < Math.min(h, l.h) * 0.5);
    if (line) line.items.push(it);
    else lines.push({ cy, h, items: [it] });
  }
  return lines.map((l) => l.items.sort((a, b) => a.x0 - b.x0));
}

// Resize song tuyến tính, tùy chọn cắt vùng r = {x0,y0,x1,y1} trước.
function resize(img, w, h, r = { x0: 0, y0: 0, x1: img.width, y1: img.height }) {
  const out = new Uint8ClampedArray(w * h * 4);
  const sw = (r.x1 - r.x0) / w, sh = (r.y1 - r.y0) / h;
  const W = img.width, H = img.height, src = img.data;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(H - 1, Math.max(0, r.y0 + (y + 0.5) * sh - 0.5));
    const y0 = Math.floor(fy), y1 = Math.min(H - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(W - 1, Math.max(0, r.x0 + (x + 0.5) * sw - 0.5));
      const x0 = Math.floor(fx), x1 = Math.min(W - 1, x0 + 1), tx = fx - x0;
      const a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        out[o + k] = (src[a + k] * (1 - tx) + src[b + k] * tx) * (1 - ty) + (src[c + k] * (1 - tx) + src[d + k] * tx) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}
