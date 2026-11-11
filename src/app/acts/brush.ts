/**
 * 毛笔：把手指 / 鼠标 / 压感笔的轨迹画成有粗细的墨迹。
 *   粗细：有压感时听压感；没有时听快慢——慢则重、快则轻；起笔有一顿，收笔快时带出锋。
 *   画法：沿轨迹密密地盖圆点；走得快时墨不够，点会漏（飞白）。
 *   每一笔存成一串（x, y, w）字节（各归一到 0…255），所以二百六十个字的手迹只有一百多 KB，可以存在本机、随时重画成小字。
 */

export type Stroke = Uint8Array;   // [x, y, w, x, y, w, …]，x、y 相对格子边长，w 相对 0.12 个边长

const WMAX = 0.062, WMIN = 0.012, WUNIT = 0.12;
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function b64(u: Uint8Array): string { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
export function unb64(s: string): Uint8Array { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
/** 一个字的全部笔画 ↔ 一个字符串（笔与笔之间用 . 隔开） */
export const packChar = (strokes: Stroke[]) => strokes.map(b64).join('.');
export const unpackChar = (s: string): Stroke[] => (s ? s.split('.').map(unb64) : []);

/** 把存下的笔画重画出来（左上角 ox, oy，边长 size） */
export function drawStrokes(g: CanvasRenderingContext2D, strokes: Stroke[], ox: number, oy: number, size: number, color = '#191613') {
  g.fillStyle = color;
  for (const s of strokes) {
    let seed = s.length * 7919;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i + 5 < s.length || i === 0; i += 3) {
      const x0 = (s[i] / 255) * size, y0 = (s[i + 1] / 255) * size, w0 = (s[i + 2] / 255) * WUNIT * size;
      const last = i + 5 >= s.length;
      const x1 = last ? x0 : (s[i + 3] / 255) * size, y1 = last ? y0 : (s[i + 4] / 255) * size, w1 = last ? w0 : (s[i + 5] / 255) * WUNIT * size;
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / Math.max(0.6, Math.min(w0, w1) * 0.22)));
      const dry = sm(size * 0.045, size * 0.12, d);        // 两点离得远 = 走得快 = 墨干
      for (let k = 0; k < n; k++) {
        const t = k / n, w = w0 + (w1 - w0) * t;
        if (dry > 0.2 && rnd() < dry * 0.55) continue;
        g.globalAlpha = 0.92 - 0.3 * dry * rnd();
        g.beginPath(); g.arc(ox + x0 + (x1 - x0) * t, oy + y0 + (y1 - y0) * t, Math.max(0.35, w / 2), 0, 6.2832); g.fill();
      }
      if (s.length <= 3) break;
    }
  }
  g.globalAlpha = 1;
}

export class Brush {
  strokes: Stroke[] = [];
  private cur: number[] = [];
  private g: CanvasRenderingContext2D;
  private px = 0; private py = 0; private pw = 0; private pt = 0; private sx = 0; private sy = 0; private v = 0; private down = false;
  /** 一笔开始 / 结束（给声音用）：len 是这一笔的长度（格） */
  onStroke: ((phase: 'start' | 'end', len: number) => void) | null = null;
  private len = 0;
  constructor(private canvas: HTMLCanvasElement) { this.g = canvas.getContext('2d')!; }
  get size() { return this.canvas.width; }
  get writing() { return this.down; }

  private stamp(x0: number, y0: number, w0: number, x1: number, y1: number, w1: number) {
    const g = this.g, S = this.size;
    const d = Math.hypot(x1 - x0, y1 - y0) * S, n = Math.max(1, Math.ceil(d / Math.max(0.6, Math.min(w0, w1) * S * 0.22)));
    const dry = sm(0.045, 0.12, Math.hypot(x1 - x0, y1 - y0));
    g.fillStyle = '#191613';
    for (let k = 0; k < n; k++) {
      const t = k / n, w = (w0 + (w1 - w0) * t) * S;
      if (dry > 0.2 && Math.random() < dry * 0.55) continue;
      g.globalAlpha = 0.92 - 0.3 * dry * Math.random();
      g.beginPath(); g.arc((x0 + (x1 - x0) * t) * S, (y0 + (y1 - y0) * t) * S, Math.max(0.35, w / 2), 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  }
  private push(x: number, y: number, w: number) {
    this.cur.push(Math.round(Math.max(0, Math.min(1, x)) * 255), Math.round(Math.max(0, Math.min(1, y)) * 255), Math.round(Math.max(0, Math.min(1, w / WUNIT)) * 255));
  }
  /** x、y 是相对格子的 0…1；t 毫秒；p 压感（0 表示没有） */
  begin(x: number, y: number, t: number, p = 0) {
    this.down = true; this.cur = []; this.len = 0;
    this.px = this.sx = x; this.py = this.sy = y; this.pt = t; this.v = 0;
    this.pw = p > 0 ? WMIN + (WMAX - WMIN) * p : WMAX * 0.78;      // 起笔一顿
    this.stamp(x, y, this.pw, x, y, this.pw);
    this.push(x, y, this.pw);
    this.onStroke?.('start', 0);
  }
  move(x: number, y: number, t: number, p = 0) {
    if (!this.down) return;
    // 手抖：位置先平滑一下
    this.sx += (x - this.sx) * 0.55; this.sy += (y - this.sy) * 0.55;
    const d = Math.hypot(this.sx - this.px, this.sy - this.py), dt = Math.max(1, t - this.pt) / 1000;
    if (d < 0.004) return;
    this.v += (d / dt - this.v) * 0.4;
    const target = p > 0 && p !== 0.5 ? WMIN + (WMAX - WMIN) * Math.pow(p, 0.8) : WMAX - (WMAX - WMIN) * sm(0.5, 3.4, this.v);
    const w = this.pw + (target - this.pw) * 0.3;
    this.stamp(this.px, this.py, this.pw, this.sx, this.sy, w);
    this.len += d;
    this.push(this.sx, this.sy, w);
    this.px = this.sx; this.py = this.sy; this.pw = w; this.pt = t;
  }
  end() {
    if (!this.down) return;
    this.down = false;
    // 收笔：走得快就带出一点锋
    if (this.cur.length >= 6 && this.v > 0.9) {
      const n = this.cur.length, dx = (this.cur[n - 3] - this.cur[n - 6]) / 255, dy = (this.cur[n - 2] - this.cur[n - 5]) / 255, l = Math.hypot(dx, dy) || 1;
      const k = Math.min(0.05, this.v * 0.014);
      const ex = this.px + (dx / l) * k, ey = this.py + (dy / l) * k;
      this.stamp(this.px, this.py, this.pw, ex, ey, WMIN * 0.4);
      this.push(ex, ey, WMIN * 0.4);
    }
    this.strokes.push(new Uint8Array(this.cur));
    this.onStroke?.('end', this.len);
  }
  clear() { this.strokes = []; this.cur = []; this.down = false; this.g.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  /** 写下的墨盖住了范字的几成；有几成写在范字之外。用 48×48 的粗格比 */
  coverage(model: HTMLCanvasElement): { cover: number; stray: number; ink: number } {
    const N = 48, a = document.createElement('canvas'), b = document.createElement('canvas');
    a.width = a.height = b.width = b.height = N;
    const ga = a.getContext('2d', { willReadFrequently: true })!, gb = b.getContext('2d', { willReadFrequently: true })!;
    ga.drawImage(this.canvas, 0, 0, N, N); gb.drawImage(model, 0, 0, N, N);
    const da = ga.getImageData(0, 0, N, N).data, db = gb.getImageData(0, 0, N, N).data;
    // 范字的笔画细，先把它「描粗」一圈（3×3 膨胀）再比
    const mk = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) if (db[i * 4 + 3] > 40) mk[i] = 1;
    const fat = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let on = 0;
      for (let j = -1; j <= 1 && !on; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < N && yy < N && mk[yy * N + xx]) { on = 1; break; } }
      fat[y * N + x] = on;
    }
    let glyph = 0, hit = 0, ink = 0, out = 0;
    for (let i = 0; i < N * N; i++) {
      const w = da[i * 4 + 3] > 50;
      if (mk[i]) { glyph++; if (w) hit++; }
      if (w) { ink++; if (!fat[i]) out++; }
    }
    return { cover: glyph ? hit / glyph : 0, stray: ink ? out / ink : 0, ink: ink / (N * N) };
  }
}
