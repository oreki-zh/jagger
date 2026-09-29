/*
 * Logo size exporter.
 *
 * Re-exports a style at a custom logo scale while keeping the 1080 × 320
 * canvas. Everything runs in the browser, without dependencies:
 *   GIF → decode the published 50 fps GIF, scale each frame about the canvas
 *         centre, quantise to one global palette and re-encode with the same
 *         frame delays (identical frames stay merged, total stays 4.5 s).
 *   MP4 → seek the published 60 fps MP4 frame by frame, scale, encode with
 *         WebCodecs H.264 and write a single-track, fast-start MP4.
 */
(() => {
  'use strict';

  // ── GIF decoding ────────────────────────────────────────────────────────
  function lzwDecode(minSize, data, pixelCount) {
    const out = new Uint8Array(pixelCount);
    const clear = 1 << minSize, eoi = clear + 1;
    const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096);
    const stack = new Uint8Array(4097);
    for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; }
    let size = minSize + 1, mask = (1 << size) - 1, next = eoi + 1, old = -1;
    let bits = 0, datum = 0, pos = 0, op = 0;
    while (op < pixelCount) {
      while (bits < size && pos < data.length) { datum |= data[pos++] << bits; bits += 8; }
      if (bits < size) break;
      const code = datum & mask; datum >>>= size; bits -= size;
      if (code === clear) { size = minSize + 1; mask = (1 << size) - 1; next = eoi + 1; old = -1; continue; }
      if (code === eoi) break;
      let c = code, sp = 0;
      if (old === -1) { out[op++] = suffix[code]; old = code; continue; }
      if (code >= next) { stack[sp++] = first[old]; c = old; }
      while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
      stack[sp++] = suffix[c];
      const head = suffix[c];
      while (sp && op < pixelCount) out[op++] = stack[--sp];
      if (next < 4096) {
        prefix[next] = old; suffix[next] = head; first[next] = first[old];
        next++;
        if ((next & mask) === 0 && next < 4096) { size++; mask = (1 << size) - 1; }
      }
      old = code;
    }
    return out;
  }

  function decodeGif(buffer) {
    const b = new Uint8Array(buffer);
    let p = 0;
    const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
    const sig = String.fromCharCode(...b.subarray(0, 6));
    if (!sig.startsWith('GIF')) throw new Error('不是有效的 GIF 文件');
    p = 6;
    const width = u16(), height = u16(), packed = b[p++]; p += 2;
    let globalTable = null;
    if (packed & 0x80) { const n = 3 << ((packed & 7) + 1); globalTable = b.subarray(p, p + n); p += n; }
    const canvas = new Uint8ClampedArray(width * height * 4).fill(255);
    const frames = [];
    let gce = { disposal: 0, delay: 0, transparent: -1 };
    const subBlocks = () => {
      const parts = []; let total = 0;
      for (let len = b[p++]; len; len = b[p++]) { parts.push(b.subarray(p, p + len)); total += len; p += len; }
      const out = new Uint8Array(total); let o = 0;
      for (const part of parts) { out.set(part, o); o += part.length; }
      return out;
    };
    while (p < b.length) {
      const block = b[p++];
      if (block === 0x3B) break;
      if (block === 0x21) {
        const label = b[p++];
        if (label === 0xF9) {
          p++; const f = b[p++]; const delay = u16(); const ti = b[p++]; p++;
          gce = { disposal: (f >> 2) & 7, delay: delay * 10, transparent: f & 1 ? ti : -1 };
        } else subBlocks();
      } else if (block === 0x2C) {
        const left = u16(), top = u16(), w = u16(), h = u16(), ip = b[p++];
        let table = globalTable;
        if (ip & 0x80) { const n = 3 << ((ip & 7) + 1); table = b.subarray(p, p + n); p += n; }
        const minSize = b[p++];
        let indices = lzwDecode(minSize, subBlocks(), w * h);
        if (ip & 0x40) { // de-interlace
          const rows = new Uint8Array(w * h); let src = 0;
          for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]])
            for (let y = start; y < h; y += step, src++) rows.set(indices.subarray(src * w, src * w + w), y * w);
          indices = rows;
        }
        const saved = gce.disposal === 3 ? canvas.slice() : null;
        for (let y = 0; y < h; y++) {
          const cy = top + y; if (cy >= height) break;
          for (let x = 0; x < w; x++) {
            const cx = left + x; if (cx >= width) break;
            const idx = indices[y * w + x];
            if (idx === gce.transparent) continue;
            const o = (cy * width + cx) * 4, t = idx * 3;
            canvas[o] = table[t]; canvas[o + 1] = table[t + 1]; canvas[o + 2] = table[t + 2]; canvas[o + 3] = 255;
          }
        }
        frames.push({ rgba: canvas.slice(), delay: gce.delay || 20 });
        if (gce.disposal === 2) {
          for (let y = top; y < Math.min(height, top + h); y++) canvas.fill(255, (y * width + left) * 4, (y * width + Math.min(width, left + w)) * 4);
        } else if (saved) canvas.set(saved);
        gce = { disposal: 0, delay: 0, transparent: -1 };
      } else throw new Error('GIF 结构无法识别');
    }
    return { width, height, frames, palette: globalTable ? Array.from({ length: globalTable.length / 3 }, (_, i) => [globalTable[i * 3], globalTable[i * 3 + 1], globalTable[i * 3 + 2]]) : null };
  }

  // ── Palette (median cut on a 6-bit-per-channel histogram) ──────────────
  const key = (r, g, bl) => ((r >> 2) << 12) | ((g >> 2) << 6) | (bl >> 2);
  function buildPalette(samples, maxColors = 256) {
    const count = new Uint32Array(1 << 18), sr = new Float64Array(1 << 18), sg = new Float64Array(1 << 18), sb = new Float64Array(1 << 18);
    for (const px of samples) for (let i = 0; i < px.length; i += 4) {
      const k = key(px[i], px[i + 1], px[i + 2]);
      count[k]++; sr[k] += px[i]; sg[k] += px[i + 1]; sb[k] += px[i + 2];
    }
    const bins = [];
    for (let k = 0; k < count.length; k++) if (count[k]) bins.push({ n: count[k], r: sr[k] / count[k], g: sg[k] / count[k], b: sb[k] / count[k] });
    if (bins.length <= maxColors) return bins.map(v => [Math.round(v.r), Math.round(v.g), Math.round(v.b)]);
    const describe = items => {
      let lo = [255, 255, 255], hi = [0, 0, 0], n = 0;
      for (const v of items) { const c = [v.r, v.g, v.b]; for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], c[j]); hi[j] = Math.max(hi[j], c[j]); } n += v.n; }
      const ranges = hi.map((h, j) => h - lo[j]); const axis = ranges.indexOf(Math.max(...ranges));
      return { items, n, axis, score: ranges[axis] * Math.sqrt(n) };
    };
    const boxes = [describe(bins)];
    while (boxes.length < maxColors) {
      boxes.sort((a, z) => z.score - a.score);
      const box = boxes[0];
      if (box.items.length < 2 || box.score === 0) break;
      const ch = ['r', 'g', 'b'][box.axis];
      box.items.sort((a, z) => a[ch] - z[ch]);
      let acc = 0, cut = 1;
      for (let i = 0; i < box.items.length - 1; i++) { acc += box.items[i].n; if (acc >= box.n / 2) { cut = i + 1; break; } }
      boxes.splice(0, 1, describe(box.items.slice(0, cut)), describe(box.items.slice(cut)));
    }
    return boxes.map(({ items, n }) => {
      let r = 0, g = 0, bl = 0; for (const v of items) { r += v.r * v.n; g += v.g * v.n; bl += v.b * v.n; }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }
  function paletteMapper(palette) {
    const lut = new Int16Array(1 << 18).fill(-1);
    return (r, g, bl) => {
      const k = key(r, g, bl);
      let v = lut[k];
      if (v < 0) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const c = palette[i], d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - bl) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        v = lut[k] = best;
      }
      return v;
    };
  }

  // ── GIF encoding ────────────────────────────────────────────────────────
  class ByteWriter {
    constructor() { this.buf = new Uint8Array(1 << 20); this.len = 0; }
    ensure(n) { if (this.len + n > this.buf.length) { const nb = new Uint8Array(Math.max(this.buf.length * 2, this.len + n)); nb.set(this.buf.subarray(0, this.len)); this.buf = nb; } }
    byte(v) { this.ensure(1); this.buf[this.len++] = v; }
    u16(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
    bytes(a) { this.ensure(a.length); this.buf.set(a, this.len); this.len += a.length; }
    ascii(s) { for (const c of s) this.byte(c.charCodeAt(0)); }
    result() { return this.buf.slice(0, this.len); }
  }
  const lzwTable = new Int32Array(4096 * 256);
  let lzwGeneration = 0;
  function lzwEncode(w, indices) {
    const minSize = 8, clear = 256, eoi = 257;
    const block = new Uint8Array(255); let blen = 0;
    const flushByte = v => { block[blen++] = v; if (blen === 255) { w.byte(255); w.bytes(block); blen = 0; } };
    let acc = 0, nbits = 0, size = minSize + 1, next = eoi + 1;
    const emit = code => { acc |= code << nbits; nbits += size; while (nbits >= 8) { flushByte(acc & 255); acc >>>= 8; nbits -= 8; } };
    const reset = () => { lzwGeneration = (lzwGeneration + 1) & 0x7ffff; if (!lzwGeneration) { lzwTable.fill(0); lzwGeneration = 1; } next = eoi + 1; };
    w.byte(minSize);
    reset(); emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], slot = prefix * 256 + k, entry = lzwTable[slot];
      if ((entry >>> 12) === lzwGeneration) { prefix = entry & 4095; continue; }
      emit(prefix);
      if (next < 4096) {
        lzwTable[slot] = (lzwGeneration << 12) | next;
        if (next === (1 << size)) size++;
        next++;
      } else { emit(clear); size = minSize + 1; reset(); }
      prefix = k;
    }
    emit(prefix);
    if (next === (1 << size) && size < 12) size++;
    emit(eoi);
    if (nbits > 0) flushByte(acc & 255);
    if (blen) { w.byte(blen); w.bytes(block.subarray(0, blen)); }
    w.byte(0);
  }
  function encodeGif(width, height, palette, frames) {
    const w = new ByteWriter();
    w.ascii('GIF89a'); w.u16(width); w.u16(height); w.byte(0xF7); w.byte(0); w.byte(0);
    for (let i = 0; i < 256; i++) { const c = palette[i] || [0, 0, 0]; w.byte(c[0]); w.byte(c[1]); w.byte(c[2]); }
    w.byte(0x21); w.byte(0xFF); w.byte(11); w.ascii('NETSCAPE2.0'); w.byte(3); w.byte(1); w.u16(0); w.byte(0);
    let prev = null;
    for (const f of frames) {
      // Only the changed rectangle is stored; disposal 1 keeps the rest.
      let x0 = 0, y0 = 0, x1 = width, y1 = height;
      if (prev) {
        x0 = width; y0 = height; x1 = 0; y1 = 0;
        for (let y = 0; y < height; y++) {
          const row = y * width;
          for (let x = 0; x < width; x++) if (f.indices[row + x] !== prev[row + x]) {
            if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; y1 = y + 1;
          }
        }
        if (x1 <= x0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
      }
      const rw = x1 - x0, rh = y1 - y0, sub = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y++) sub.set(f.indices.subarray((y0 + y) * width + x0, (y0 + y) * width + x1), y * rw);
      w.byte(0x21); w.byte(0xF9); w.byte(4); w.byte(0x04); w.u16(Math.round(f.delay / 10)); w.byte(0); w.byte(0);
      w.byte(0x2C); w.u16(x0); w.u16(y0); w.u16(rw); w.u16(rh); w.byte(0);
      lzwEncode(w, sub);
      prev = f.indices;
    }
    w.byte(0x3B);
    return w.result();
  }

  // ── MP4 writing (single H.264 track, moov before mdat) ──────────────────
  function box(type, ...parts) {
    // Parts are nested arrays of byte values and/or Uint8Arrays (child boxes).
    const body = [], bytes = [];
    const flushBytes = () => { if (bytes.length) { body.push(Uint8Array.from(bytes)); bytes.length = 0; } };
    const walk = part => {
      if (ArrayBuffer.isView(part)) { flushBytes(); body.push(new Uint8Array(part.buffer, part.byteOffset, part.byteLength)); }
      else if (Array.isArray(part)) part.forEach(walk);
      else bytes.push(part & 255);
    };
    parts.forEach(walk); flushBytes();
    const size = 8 + body.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    dv.setUint32(0, size); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    let o = 8; for (const p of body) { out.set(p, o); o += p.length; }
    return out;
  }
  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16b = v => [(v >> 8) & 255, v & 255];
  const full = (v, f) => [v, (f >> 16) & 255, (f >> 8) & 255, f & 255];
  const matrix = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);
  function muxMp4({ width, height, fps, chunks, description }) {
    const n = chunks.length, durationMs = Math.round(n * 1000 / fps);
    const pts = chunks.map(c => Math.round(c.timestamp * fps / 1e6));
    const shift = Math.max(0, ...pts.map((t, i) => i - t));
    const ctts = pts.some((t, i) => t !== i) ? box('ctts', full(0, 0), u32(n), pts.map((t, i) => [u32(1), u32(t - i + shift)])) : [];
    const avcC = box('avcC', new Uint8Array(description));
    const avc1 = box('avc1', new Array(6).fill(0), u16b(1), new Array(16).fill(0), u16b(width), u16b(height),
      u32(0x00480000), u32(0x00480000), u32(0), u16b(1), new Array(32).fill(0), u16b(0x18), u16b(0xFFFF), avcC);
    const keyframes = chunks.map((c, i) => c.type === 'key' ? i + 1 : 0).filter(Boolean);
    const build = offset => box('moov',
      box('mvhd', full(0, 0), u32(0), u32(0), u32(1000), u32(durationMs), u32(0x00010000), u16b(0x0100), new Array(10).fill(0), matrix, new Array(24).fill(0), u32(2)),
      box('trak',
        box('tkhd', full(0, 3), u32(0), u32(0), u32(1), u32(0), u32(durationMs), new Array(8).fill(0), u16b(0), u16b(0), u16b(0), u16b(0), matrix, u32(width << 16), u32(height << 16)),
        box('mdia',
          box('mdhd', full(0, 0), u32(0), u32(0), u32(fps), u32(n), u16b(0x55C4), u16b(0)),
          box('hdlr', full(0, 0), u32(0), [...'vide'].map(c => c.charCodeAt(0)), new Array(12).fill(0), [...'VideoHandler'].map(c => c.charCodeAt(0)), [0]),
          box('minf',
            box('vmhd', full(0, 1), new Array(8).fill(0)),
            box('dinf', box('dref', full(0, 0), u32(1), box('url ', full(0, 1)))),
            box('stbl',
              box('stsd', full(0, 0), u32(1), avc1),
              box('stts', full(0, 0), u32(1), u32(n), u32(1)),
              ctts,
              box('stss', full(0, 0), u32(keyframes.length), keyframes.map(u32)),
              box('stsc', full(0, 0), u32(1), u32(1), u32(n), u32(1)),
              box('stsz', full(0, 0), u32(0), u32(n), chunks.map(c => u32(c.data.length))),
              box('stco', full(0, 0), u32(1), u32(offset)))))));
    const ftyp = box('ftyp', [...'isom'].map(c => c.charCodeAt(0)), u32(512), [...'isomiso2avc1mp41'].map(c => c.charCodeAt(0)));
    const probe = build(0);
    const moov = build(ftyp.length + probe.length + 8);
    const payload = chunks.reduce((s, c) => s + c.data.length, 0);
    const out = new Uint8Array(ftyp.length + moov.length + 8 + payload);
    out.set(ftyp, 0); out.set(moov, ftyp.length);
    let o = ftyp.length + moov.length;
    out.set(u32(8 + payload), o); out.set([...'mdat'].map(c => c.charCodeAt(0)), o + 4); o += 8;
    for (const c of chunks) { out.set(c.data, o); o += c.data.length; }
    return out;
  }

  // ── Frame scaling ───────────────────────────────────────────────────────
  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return [c, c.getContext('2d', { willReadFrequently: true })];
  }
  function drawScaled(ctx, source, width, height, scale, background = '#fff') {
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const w = width * scale, h = height * scale;
    ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h);
  }
  const tick = () => new Promise(r => setTimeout(r, 0));

  async function exportGif(url, scale, onProgress = () => {}, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`无法读取 GIF（${response.status}）`);
    const source = decodeGif(await response.arrayBuffer());
    const { width, height } = source;
    const [src, sctx] = makeCanvas(width, height), [dst, dctx] = makeCanvas(width, height);
    const image = sctx.createImageData(width, height);
    // Fill the uncovered border with the artwork's own background colour.
    const first = source.frames[0].rgba, background = `rgb(${first[0]},${first[1]},${first[2]})`;
    const scaled = [];
    for (let i = 0; i < source.frames.length; i++) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      image.data.set(source.frames[i].rgba); sctx.putImageData(image, 0, 0);
      drawScaled(dctx, src, width, height, scale, background);
      scaled.push({ rgba: dctx.getImageData(0, 0, width, height).data, delay: source.frames[i].delay });
      source.frames[i].rgba = null;
      if (i % 8 === 0) { onProgress(.45 * i / source.frames.length); await tick(); }
    }
    // The published GIF's global palette already holds the exact brand colours
    // and their anti-aliasing ramps; scaled pixels are blends of those colours.
    let palette = source.palette && source.palette.length >= 64 ? source.palette.slice(0, 256) : null;
    if (!palette) {
      const step = Math.max(1, Math.floor(scaled.length / 24));
      palette = buildPalette(scaled.filter((_, i) => i % step === 0).map(f => f.rgba), 255);
    }
    if (!palette.some(c => c[0] === 255 && c[1] === 255 && c[2] === 255)) palette[palette.length < 256 ? palette.length : 255] = [255, 255, 255];
    const map = paletteMapper(palette);
    const frames = [];
    for (let i = 0; i < scaled.length; i++) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      const px = scaled[i].rgba, indices = new Uint8Array(width * height);
      for (let p = 0, q = 0; q < indices.length; p += 4, q++) indices[q] = map(px[p], px[p + 1], px[p + 2]);
      const last = frames[frames.length - 1];
      if (last && last.indices.every((v, j) => v === indices[j])) last.delay += scaled[i].delay;
      else frames.push({ indices, delay: scaled[i].delay });
      scaled[i] = null;
      if (i % 8 === 0) { onProgress(.45 + .45 * i / scaled.length); await tick(); }
    }
    const bytes = encodeGif(width, height, palette, frames);
    onProgress(1);
    return new Blob([bytes], { type: 'image/gif' });
  }

  async function pickEncoderConfig(width, height, fps) {
    if (!('VideoEncoder' in window)) return null;
    for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42001f']) {
      const config = { codec, width, height, framerate: fps, bitrate: 6_000_000, avc: { format: 'avc' } };
      try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config; } catch { /* try next */ }
    }
    return null;
  }
  const mp4Supported = () => 'VideoEncoder' in window && 'VideoFrame' in window;

  async function exportMp4(url, scale, { width = 1080, height = 320, fps = 60, frames = 270 } = {}, onProgress = () => {}, signal) {
    const config = await pickEncoderConfig(width, height, fps);
    if (!config) throw new Error('当前浏览器不支持 H.264 视频编码，请使用最新版 Chrome、Edge 或 Safari 导出 MP4，或改为导出 GIF。');
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('无法读取 MP4 源文件')), { once: true });
    });
    const [dst, dctx] = makeCanvas(width, height);
    const chunks = []; let description = null, failure = null, background = '#fff';
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        chunks.push({ data, timestamp: chunk.timestamp, type: chunk.type });
        if (meta?.decoderConfig?.description && !description) description = meta.decoderConfig.description;
      },
      error: e => { failure = e; },
    });
    encoder.configure(config);
    try {
      for (let i = 0; i < frames; i++) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        if (failure) throw failure;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('视频定位超时，请重试')), 8000);
          video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
          video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('无法读取 MP4 源文件')); }, { once: true });
          video.currentTime = Math.min(video.duration - 1e-3, (i + .5) / fps);
        });
        if (i === 0) {
          dctx.drawImage(video, 0, 0, width, height);
          const [r, g, bl] = dctx.getImageData(2, 2, 1, 1).data;
          background = `rgb(${r},${g},${bl})`;
        }
        drawScaled(dctx, video, width, height, scale, background);
        const frame = new VideoFrame(dst, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        encoder.encode(frame, { keyFrame: i % fps === 0 });
        frame.close();
        while (encoder.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
        onProgress(.95 * (i + 1) / frames);
      }
      await encoder.flush();
      if (failure) throw failure;
    } finally {
      if (encoder.state !== 'closed') encoder.close();
      video.removeAttribute('src'); video.load();
    }
    if (!description) throw new Error('编码器没有返回 H.264 参数');
    const bytes = muxMp4({ width, height, fps, chunks, description });
    onProgress(1);
    return new Blob([bytes], { type: 'video/mp4' });
  }

  window.LogoExporter = { exportGif, exportMp4, mp4Supported, decodeGif, encodeGif, buildPalette, muxMp4 };
})();
