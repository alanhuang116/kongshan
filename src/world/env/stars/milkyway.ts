/**
 * 天汉（银河）：按银道坐标现画的一张图（不用外来的数据）。横是银经 0°…360°，竖是银纬 −36°…+36°。
 * r 是这一处有多亮（0…1），g 是尘带（暗隙）有多浓。
 *
 * 明暗的大势按常识摆：人马座方向（银心，银经 0°）最亮最宽，盾牌座那一团（银经 27°）、天鹅座（银经 78°）次之，
 * 仙后、英仙一带（银经 110°–150°）淡一些，御夫、金牛那边（反银心，银经 180°）最淡；
 * 天鹅座到人马座之间有一道把银河劈成两股的暗隙，银心附近贴着银道有一条尘带。细处的团块、颗粒是噪声。
 * 这是画，不是测绘：位置、走向对，细节是写意的。
 */
import * as THREE from 'three';

export const MW_B = 36;
const D = Math.PI / 180;

function hash(x: number, y: number): number { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** 值噪声，x 方向以 px 为周期（银经绕一圈要接得上） */
function vnoise(x: number, y: number, px: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const w = (i: number) => ((i % px) + px) % px;
  const a = hash(w(xi), yi), b = hash(w(xi + 1), yi), c = hash(w(xi), yi + 1), d = hash(w(xi + 1), yi + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, px: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, px * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
/** 以 mu 为中心、宽 s 的钟形（银经要绕圈算） */
const g = (l: number, mu: number, s: number) => { let x = l - mu; x -= 360 * Math.round(x / 360); return Math.exp(-0.5 * (x / s) * (x / s)); };
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 银经 l、银纬 b（度）这一处：[亮, 尘] */
export function milky(l: number, b: number): [number, number] {
  // 带宽（银纬方向的半宽）：银心附近宽，天鹅座一带也宽一些
  const sig = 4.2 + 4.6 * g(l, 0, 38) + 1.6 * g(l, 78, 22) + 0.8 * g(l, 300, 30);
  // 银道略有起伏
  const b0 = 0.9 * Math.sin(l * D * 2 + 0.6) - 0.6 * g(l, 0, 25);
  const L = 0.26 + 0.74 * g(l, 0, 30) + 0.34 * g(l, 27, 7) + 0.36 * g(l, 78, 15) + 0.14 * g(l, 128, 26) + 0.2 * g(l, 335, 16) + 0.12 * g(l, 290, 22) - 0.1 * g(l, 180, 30);
  // 带的边不齐：宽窄跟着噪声走
  const env = Math.exp(-0.5 * ((b - b0) / (sig * (0.8 + 0.45 * fbm(l / 7, 3, 51)))) ** 2);
  let v = L * env;
  // 银心的核球：人马座那一大团
  v += 0.38 * g(l, 2, 11) * Math.exp(-0.5 * ((b + 2.5) / 7.5) ** 2);
  // 星云团：一团一团的（不是一条匀的带），团里再有细的颗粒（银经方向绕一圈周期 360）
  const cloud = sm(0.2, 0.85, fbm(l / 5.5, b / 3.2 + 40, 65)), mid = fbm(l / 1.9, b / 1.5 + 80, 189), fine = fbm(l / 0.6, b / 0.55 + 9, 600, 3);
  v *= 0.42 + 0.78 * cloud;
  v *= 0.58 + 0.68 * mid;
  v *= 0.72 + 0.5 * fine;
  // 暗隙：天鹅座（银经 85°）到人马、蛇夫（银经 5°）——北银纬那一侧，往银心走慢慢抬高；走向弯弯曲曲，时断时续
  const inRift = sm(2, 14, l) * (1 - sm(80, 92, l));
  const bR = 0.6 + 0.07 * Math.max(0, 70 - l) + 2.2 * (fbm(l / 5, 300, 72) - 0.5);
  const wR = (1.3 + 0.03 * Math.max(0, 85 - l)) * (0.6 + 0.8 * fbm(l / 3.5, 500, 103));
  let dust = 0.85 * inRift * Math.exp(-0.5 * ((b - bR) / wR) ** 2) * sm(0.3, 0.62, fbm(l / 3, b / 1.6 + 200, 120));
  // 银心贴着银道的一条尘带（也不是直的）
  dust = Math.max(dust, 0.55 * g(l, 0, 22) * Math.exp(-0.5 * ((b - 0.3 - 1.4 * (fbm(l / 4, 900, 90) - 0.5)) / 1.1) ** 2));
  // 带里零零星星的暗云
  dust = Math.max(dust, 0.5 * env * sm(0.6, 0.78, fbm(l / 1.6, b / 1.1 + 700, 225)));
  // 蛇夫座 ρ 一带的暗云、金牛座的暗云：淡淡的
  dust = Math.max(dust, 0.45 * g(l, 355, 6) * Math.exp(-0.5 * ((b - 16) / 4) ** 2), 0.3 * g(l, 172, 9) * Math.exp(-0.5 * ((b + 15) / 5) ** 2));
  v *= 1 - 0.8 * dust;
  return [Math.max(0, Math.min(1, v)), Math.max(0, Math.min(1, dust * (0.35 + v)))];
}

/** 一张空的（还没画好时先用它） */
export function emptyMilkyWay(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
/**
 * 现画一张天汉图（w × h）。分几段画、每段之间让出主线程（开场时别卡），画完 onDone。
 */
export function paintMilkyWay(w: number, h: number, onDone: (t: THREE.DataTexture) => void): void {
  const data = new Uint8Array(w * h * 4);
  let row = 0;
  const step = () => {
    const t0 = performance.now();
    for (; row < h && performance.now() - t0 < 8; row++) {
      const b = (row / (h - 1) - 0.5) * 2 * MW_B;
      for (let x = 0; x < w; x++) {
        const [v, d] = milky((x / w) * 360, b), i = (row * w + x) * 4;
        data[i] = Math.round(v * 255); data[i + 1] = Math.round(d * 255); data[i + 2] = 0; data[i + 3] = 255;
      }
    }
    if (row < h) { setTimeout(step, 0); return; }
    // 亮的那一头（千分之五最亮的）压到 1：银心不至于一片白，别处也不至于太淡
    const hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
    let acc = 0, mx = 255; const cut = (data.length / 4) * 0.005;
    for (let v = 255; v > 0; v--) { acc += hist[v]; if (acc > cut) { mx = Math.max(1, v); break; } }
    for (let i = 0; i < data.length; i += 4) data[i] = Math.min(255, Math.round((data[i] / mx) * 255));
    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    tex.needsUpdate = true;
    onDone(tex);
  };
  step();
}
