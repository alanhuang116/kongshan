/**
 * 画面的底座：渲染器、画法（ink/painter.ts 的四步）、主循环、画质档位、指针输入。
 * 园里的一切（天时、屋舍、草木、人、活动）都挂在它上面，各自登记一个每帧调用的函数。
 */
import * as THREE from 'three';
import { U } from '../ink/ink';
import { Painter } from '../ink/painter';

export type Tier = 'low' | 'mid' | 'high';
export interface Quality {
  tier: Tier;
  /** 像素比上限 */
  dpr: number;
  /** 多重采样数（点叶点花的软边也靠它） */
  msaa: number;
  /** 笔触图集尺寸倍率 */
  tex: number;
  /** 树、草、花等的数量倍率 */
  density: number;
  mobile: boolean;
}

export function detectQuality(force?: string | null): Quality {
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const ua = nav.userAgent ?? '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || ((nav.maxTouchPoints ?? 0) > 1 && Math.min(screen.width, screen.height) < 900);
  const mem = (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 4, cores = nav.hardwareConcurrency ?? 4;
  let tier: Tier = mobile ? (mem >= 6 && cores >= 8 ? 'mid' : 'low') : cores >= 8 ? 'high' : 'mid';
  if (force === 'low' || force === 'mid' || force === 'high') tier = force;
  const T: Record<Tier, Omit<Quality, 'tier' | 'mobile'>> = {
    low: { dpr: 1.25, msaa: 4, tex: 0.5, density: 0.5 },
    mid: { dpr: 1.5, msaa: 4, tex: mobile ? 0.75 : 1, density: 0.75 },
    high: { dpr: 2, msaa: 4, tex: 1, density: 1 },
  };
  return { tier, mobile, ...T[tier] };
}

export interface Pointer { id: number; x: number; y: number; nx: number; ny: number; dx: number; dy: number; down: boolean; t0: number; x0: number; y0: number; moved: number; type: string }
export interface InputHandler {
  down?(p: Pointer, e: PointerEvent): void;
  move?(p: Pointer, e: PointerEvent): void;
  up?(p: Pointer, e: PointerEvent): void;
  /** 没怎么动、很快抬起：一次轻点 */
  tap?(p: Pointer, e: PointerEvent): void;
  /** 鼠标没按下时的移动 */
  hover?(p: Pointer, e: PointerEvent): void;
  wheel?(dy: number, e: WheelEvent): void;
}

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.3, 16000);
  painter: Painter;
  quality: Quality;
  /** 每帧调用的函数（dt 秒，t 自开始的秒数） */
  tick: Array<(dt: number, t: number) => void> = [];
  /** 渲染前（主画面之前）要先画的东西 */
  pre: Array<(r: THREE.WebGLRenderer) => void> = [];
  input: InputHandler | null = null;
  time = 0;
  /** 整幅淡成一片雾色（0…1，转场用） */
  fade = 0;
  /** 帧率上限（0 不限）。静坐、打盹时降到 30 省电 */
  fpsCap = 0;
  /** 最近的平均帧耗时（毫秒） */
  frameMs = 16;
  size = new THREE.Vector2(1, 1);
  /** 头几帧各花了多久（[逻辑, 绘制] 毫秒）：看启动时卡在哪 */
  first: Array<[number, number]> = [];
  private raf = 0; private last = 0; private acc = 0; private running = false;
  private dprNow: number; private slow = 0; private fast = 0;
  private ptr = new Map<number, Pointer>();
  private ro: ResizeObserver;
  onResize: Array<(w: number, h: number) => void> = [];

  constructor(public canvas: HTMLCanvasElement, q: Quality) {
    this.quality = q;
    // 多重采样在画法自己的那两张图上做；画布本身不要抗锯齿、不要深度
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.info.autoReset = false;
    r.setClearColor(U.uPaper.value, 1);
    this.dprNow = Math.min(window.devicePixelRatio || 1, q.dpr);
    r.setPixelRatio(this.dprNow);
    this.painter = new Painter(r, q.msaa);
    this.camera.position.set(0, 1.7, 30);
    this.scene.add(this.camera);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.bind();
  }

  resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.size.set(w, h);
    this.renderer.setPixelRatio(this.dprNow);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const f of this.onResize) f(w, h);
  }

  /** 画面太慢就降一点清晰度，宽裕了再升回来 */
  private adapt(ms: number) {
    this.frameMs += (ms - this.frameMs) * 0.05;
    const cap = Math.min(window.devicePixelRatio || 1, this.quality.dpr);
    if (this.frameMs > 26) { this.slow++; this.fast = 0; } else if (this.frameMs < 13) { this.fast++; this.slow = 0; } else { this.slow = this.fast = 0; }
    if (this.slow > 90 && this.dprNow > 0.7) { this.dprNow = Math.max(0.7, this.dprNow * 0.85); this.slow = 0; this.resize(); }
    else if (this.fast > 600 && this.dprNow < cap) { this.dprNow = Math.min(cap, this.dprNow * 1.12); this.fast = 0; this.resize(); }
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    if (this.fpsCap > 0) {
      this.acc += raw; this.last = now;
      if (this.acc < 1 / this.fpsCap - 0.002) return;
    }
    const dt = Math.max(0, Math.min(0.1, this.fpsCap > 0 ? this.acc : raw));
    this.acc = 0; this.last = now;
    this.time += dt;
    U.uTime.value = this.time;
    const t0 = this.first.length < 4 ? performance.now() : 0;
    for (const f of this.tick) f(dt, this.time);
    const t1 = this.first.length < 4 ? performance.now() : 0;
    this.render();
    if (this.first.length < 4) this.first.push([Math.round(t1 - t0), Math.round(performance.now() - t1)]);
    if (raw < 0.25) this.adapt(raw * 1000);
  };

  /** 上一帧画了多少三角形、多少次绘制 */
  stats = { tris: 0, calls: 0 };
  render() {
    const r = this.renderer;
    this.stats.tris = r.info.render.triangles; this.stats.calls = r.info.render.calls;
    r.info.reset();
    for (const f of this.pre) f(r);
    this.painter.fade = this.fade;
    this.painter.render(this.scene, this.camera);
  }

  /** 开场前把着色器都编好 */
  compile() { return this.painter.compile(this.scene, this.camera); }

  start() { if (this.running) return; this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  // —— 指针 ——
  private bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    const mk = (e: PointerEvent): Pointer => {
      const b = c.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      return { id: e.pointerId, x, y, nx: (x / b.width) * 2 - 1, ny: -(y / b.height) * 2 + 1, dx: 0, dy: 0, down: true, t0: performance.now(), x0: x, y0: y, moved: 0, type: e.pointerType };
    };
    const upd = (p: Pointer, e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      const x = e.clientX - b.left, y = e.clientY - b.top;
      p.dx = x - p.x; p.dy = y - p.y; p.x = x; p.y = y; p.nx = (x / b.width) * 2 - 1; p.ny = -(y / b.height) * 2 + 1;
      p.moved += Math.hypot(p.dx, p.dy);
    };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = mk(e); this.ptr.set(e.pointerId, p);
      try { c.setPointerCapture(e.pointerId); } catch { /* 无妨 */ }
      this.input?.down?.(p, e);
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.ptr.get(e.pointerId);
      if (p) { upd(p, e); this.input?.move?.(p, e); }
      else if (e.pointerType === 'mouse') { const h = mk(e); h.down = false; this.input?.hover?.(h, e); }
    });
    const end = (e: PointerEvent) => {
      const p = this.ptr.get(e.pointerId);
      if (!p) return;
      upd(p, e); p.down = false; this.ptr.delete(e.pointerId);
      this.input?.up?.(p, e);
      if (e.type === 'pointerup' && p.moved < 10 && performance.now() - p.t0 < 450) this.input?.tap?.(p, e);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => { this.input?.wheel?.(e.deltaY, e); }, { passive: true });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  get pointers() { return this.ptr; }

  /** 屏幕上的一点（-1…1）射出去的线 */
  ray(nx: number, ny: number, out = new THREE.Raycaster()): THREE.Raycaster {
    out.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    return out;
  }

  dispose() {
    this.stop(); this.ro.disconnect();
    this.painter.dispose();
    this.renderer.dispose();
  }
}
