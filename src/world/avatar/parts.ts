/**
 * 小人身上不变形的部件与贴图：头（脸、发、髻、束带、颈、耳）、手、脚（布鞋白袜）、背上的斗笠与系绳；
 * 长衫的贴图（交领、绦带、下摆的边、衣褶）。会变形的长衫与袖子在 figure.ts 里每帧现算。
 */
import * as THREE from 'three';
import { merge, norm, tint } from '../core/geo';
import { enhance } from '../core/mats';
import { mulberry32 } from '../core/rng';
import { canvas, canvasTex } from '../core/tex';

export const COL = {
  robe: '#aeb8bd',      // 月白（偏青的浅灰白；太白了日头下会过曝）
  trim: '#38434c',      // 领缘、绦带、下摆的边：藏青灰
  inner: '#dddbd5',     // 中衣的白领
  skin: '#dfc0a4',
  hair: '#1e1c1b',
  ribbon: '#3d4850',
  straw: '#b79f6a',
};

/** 长衫贴图的排法：上面 82% 是衣身（v=0.18 下摆 … 1 领口），最下面 16% 给袖子（v=0.01 肩 … 0.15 袖口） */
export const TEX = { body0: 0.18, sleeve0: 0.012, sleeve1: 0.152 };
/** 衣身上某个站立高度对应贴图的 v */
export const bodyV = (y: number) => TEX.body0 + (1 - TEX.body0) * Math.max(0, Math.min(1, (y - 0.085) / (1.316 - 0.085)));

export function garmentTexture(low: boolean): THREE.CanvasTexture {
  const k = low ? 0.5 : 1, W = 512, H = 1024;
  const [c, g] = canvas(W * k, H * k);
  g.scale(k, k);
  const r = mulberry32(3301);
  const Y = (y: number) => H * (1 - bodyV(y));             // 站立高度 → 画布的行
  const X = (u: number) => W * u;                          // u：0.5 是正前，0.25 是右侧（−x），0.75 是左侧
  g.fillStyle = COL.robe; g.fillRect(0, 0, W, H);
  // 布面极轻的不匀
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,50,58'},${0.012 + r() * 0.02})`; g.fillRect(r() * W, r() * H, 6 + r() * 40, 1 + r() * 2); }
  // 一道竖的衣褶：中间深、两边淡，上端渐隐
  const fold = (x: number, w: number, y0: number, y1: number, a: number, dark: boolean) => {
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const ya = y0 + ((y1 - y0) * s) / steps, yb = y0 + ((y1 - y0) * (s + 1)) / steps;
      const al = a * Math.min(1, (s + 0.5) / 3.2);
      const gr = g.createLinearGradient(x - w, 0, x + w, 0), col = dark ? '44,54,62' : '255,255,255';
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.5, `rgba(${col},${al})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - w, ya, w * 2, yb - ya + 0.6);
    }
  };
  // 下摆：自腰下垂的褶，越往下越明
  for (let i = 0; i < 30; i++) {
    const x = r() * W, w = 5 + r() * 16, top = 0.86 - r() * 0.3;
    fold(x, w, Y(top), Y(0.085), 0.13 + r() * 0.15, true);
    fold(x + w * (0.8 + r() * 0.6), w * 0.7, Y(top - 0.05), Y(0.085), 0.09 + r() * 0.09, false);
  }
  // 上身：绦带上方收拢的短褶
  for (let i = 0; i < 16; i++) { const x = r() * W, w = 4 + r() * 8; fold(x, w, Y(1.12 + r() * 0.06), Y(0.98), 0.06 + r() * 0.06, true); }
  // 腋下、带下的暗
  for (const u of [0.25, 0.75]) { const gr = g.createRadialGradient(X(u), Y(1.13), 2, X(u), Y(1.13), 58); gr.addColorStop(0, 'rgba(40,50,58,0.26)'); gr.addColorStop(1, 'rgba(40,50,58,0)'); g.fillStyle = gr; g.fillRect(X(u) - 60, Y(1.13) - 60, 120, 120); }
  { const gr = g.createLinearGradient(0, Y(0.95), 0, Y(0.88)); gr.addColorStop(0, 'rgba(40,50,58,0.2)'); gr.addColorStop(1, 'rgba(40,50,58,0)'); g.fillStyle = gr; g.fillRect(0, Y(0.95), W, Y(0.88) - Y(0.95)); }

  // —— 下摆的边 ——
  g.fillStyle = COL.trim; g.fillRect(0, Y(0.112), W, Y(0.085) - Y(0.112) + 2);
  g.fillStyle = 'rgba(221,219,213,0.5)'; g.fillRect(0, Y(0.116), W, 1.4);

  // —— 交领（右衽）：先画压在下面的右襟，再画盖在上面的左襟 ——
  const band = (pts: Array<[number, number]>, w: number, col: string) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([u, y], i) => (i ? g.lineTo(X(u), Y(y)) : g.moveTo(X(u), Y(y)))); g.stroke();
  };
  const topY = 1.33, neckY = 1.296;
  // 领口里露出的中衣（白）：两襟之间的那一小块
  g.fillStyle = COL.inner; g.beginPath(); g.moveTo(X(0.432), Y(topY)); g.lineTo(X(0.568), Y(topY)); g.lineTo(X(0.538), Y(1.215)); g.lineTo(X(0.503), Y(1.15)); g.lineTo(X(0.47), Y(1.215)); g.closePath(); g.fill();
  band([[0.44, topY], [0.462, 1.235], [0.497, 1.165], [0.51, 1.14]], 5, 'rgba(120,128,134,0.55)');   // 中衣自己的领线
  // 右襟的领缘（在下）
  band([[0.418, topY], [0.445, 1.24], [0.488, 1.165], [0.512, 1.135]], 15, COL.trim);
  // 左襟的领缘（在上）：自颈左斜掩到右腋下，没入绦带
  band([[0.582, topY], [0.556, 1.245], [0.5, 1.13], [0.44, 1.02], [0.408, 0.965]], 16, COL.trim);
  band([[0.566, topY], [0.541, 1.243], [0.487, 1.134], [0.43, 1.03], [0.398, 0.975]], 2.2, 'rgba(221,219,213,0.8)');
  // 后领：一圈立着的领缘
  g.fillStyle = COL.trim; g.fillRect(0, 0, X(0.418) + 1, Y(neckY)); g.fillRect(X(0.582) - 1, 0, W - X(0.582) + 1, Y(neckY));
  g.fillStyle = 'rgba(221,219,213,0.7)'; g.fillRect(0, Y(neckY), X(0.412), 1.6); g.fillRect(X(0.588), Y(neckY), W - X(0.588), 1.6);

  // —— 绦带：腰间一条，左前打结，垂两条带梢 ——
  const sy0 = Y(0.99), sy1 = Y(0.942);
  g.fillStyle = '#313a42'; g.fillRect(0, sy0, W, sy1 - sy0);
  for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${0.035 + (i % 2) * 0.03})`; g.fillRect(0, sy0 + 2 + i * ((sy1 - sy0 - 4) / 6), W, 1); }
  g.fillStyle = 'rgba(20,26,30,0.5)'; g.fillRect(0, sy1 - 1.5, W, 1.5);
  const kx = X(0.578), ky = (sy0 + sy1) / 2;
  const tail = (dx: number, len: number, w: number) => {
    g.strokeStyle = '#313a42'; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + dx * 0.4, ky + len * 0.5, kx + dx, ky + len); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + dx * 0.4, ky + len * 0.5, kx + dx, ky + len); g.stroke();
    // 带梢的穗
    g.strokeStyle = '#313a42'; g.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(kx + dx, ky + len); g.lineTo(kx + dx + i * 2.2, ky + len + 16 + (i % 2) * 2); g.stroke(); }
  };
  tail(-7, Y(0.62) - ky, 8); tail(13, Y(0.68) - ky, 7);
  g.fillStyle = '#2a323a'; g.beginPath(); g.ellipse(kx, ky, 12, 10.5, 0.3, 0, 6.2832); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(kx, ky, 7, 5.5, 0.3, 0, 6.2832); g.stroke();

  // —— 袖子那一条：素面，袖口一道边 ——
  const s0 = H * (1 - TEX.sleeve1) - 6, s1 = H;
  g.fillStyle = COL.robe; g.fillRect(0, s0 - 8, W, s1 - s0 + 8);
  for (let i = 0; i < 18; i++) { const x = r() * W, w = 5 + r() * 12; fold(x, w, s1, s0, 0.07 + r() * 0.08, r() < 0.7); }
  const cuff = H * (1 - TEX.sleeve1) + 15;
  g.fillStyle = COL.trim; g.fillRect(0, s0 - 8, W, cuff - s0 + 8);
  g.fillStyle = 'rgba(221,219,213,0.6)'; g.fillRect(0, cuff, W, 1.5);

  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 发际线：经度（度，正前为 0，朝左为正）处头发盖到的纬度（度） */
export function hairline(lon: number): number {
  const a = Math.abs(lon), s = (x: number) => x * x * (3 - 2 * x);
  if (a <= 52) return 39 - 5 * (a / 52) * (a / 52) + 2.2 * Math.exp(-(a / 9) * (a / 9));
  if (a <= 80) return 34 - 30 * s((a - 52) / 28);
  if (a <= 100) return 4 - 9 * ((a - 80) / 20);
  if (a <= 142) return -5 - 31 * s((a - 100) / 42);
  return -36;
}

function headTexture(low: boolean, mouth: boolean): THREE.CanvasTexture {
  const k = low ? 0.5 : 1, W = 512, H = 256;
  const [c, g] = canvas(W * k, H * k);
  g.scale(k, k);
  const X = (lon: number) => W * (0.5 + lon / 360), Y = (lat: number) => H * (0.5 - lat / 180);
  g.fillStyle = COL.skin; g.fillRect(0, 0, W, H);
  // 两颊极淡的一点血色；发际下的一点影
  for (const s of [-1, 1]) { const gr = g.createRadialGradient(X(s * 27), Y(-17), 1, X(s * 27), Y(-17), 26); gr.addColorStop(0, 'rgba(214,138,118,0.2)'); gr.addColorStop(1, 'rgba(214,138,118,0)'); g.fillStyle = gr; g.fillRect(X(s * 27) - 28, Y(-17) - 28, 56, 56); }
  // 头发
  g.fillStyle = COL.hair; g.shadowColor = 'rgba(30,28,27,0.75)'; g.shadowBlur = 3.5;
  g.beginPath(); g.moveTo(0, Y(hairline(-180)));
  for (let lon = -180; lon <= 180; lon += 2) g.lineTo(X(lon), Y(hairline(lon)));
  g.lineTo(W, 0); g.lineTo(0, 0); g.closePath(); g.fill();
  g.shadowBlur = 0;
  // 发丝：自发际往髻上梳的几道淡光
  g.lineWidth = 1;
  for (let lon = -176; lon <= 176; lon += 7) { g.strokeStyle = `rgba(120,112,104,${0.07 + 0.05 * Math.sin(lon * 1.7)})`; g.beginPath(); g.moveTo(X(lon), Y(hairline(lon)) - 2); g.lineTo(X(lon * 0.985), 0); g.stroke(); }
  // 眼：阖着的两道（白描似的），眉：更淡的两笔
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = X(s * 19.5), ey = Y(1.5);
    g.strokeStyle = 'rgba(52,38,32,0.86)'; g.lineWidth = 2.1;
    g.beginPath(); g.moveTo(ex - s * 9.5, ey - 0.4); g.quadraticCurveTo(ex, ey + 4.6, ex + s * 11.5, ey + 0.6); g.stroke();
    g.strokeStyle = 'rgba(52,38,32,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(ex + s * 11.5, ey + 0.6); g.lineTo(ex + s * 14, ey - 0.6); g.stroke();
    g.strokeStyle = 'rgba(58,44,38,0.42)'; g.lineWidth = 1.7;
    const by = Y(14.5);
    g.beginPath(); g.moveTo(ex - s * 10, by + 2.2); g.quadraticCurveTo(ex + s * 1, by - 2.4, ex + s * 14, by + 1.2); g.stroke();
  }
  if (mouth) { g.strokeStyle = 'rgba(150,84,74,0.34)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(-5.2), Y(-36.4)); g.quadraticCurveTo(X(0), Y(-37.6), X(5.2), Y(-36.4)); g.stroke(); }
  // 色样：髻与发（左下）、束带、肤
  g.fillStyle = COL.hair; g.fillRect(0, H - 14, 60, 14);
  g.fillStyle = COL.ribbon; g.fillRect(70, H - 14, 60, 14);
  g.fillStyle = COL.skin; g.fillRect(140, H - 14, 60, 14);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
const SW = { hair: [30 / 512, 6 / 256], ribbon: [100 / 512, 6 / 256], skin: [170 / 512, 6 / 256] } as const;
function uvAll(g: THREE.BufferGeometry, uv: readonly [number, number] | readonly number[]): THREE.BufferGeometry {
  const a = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0], uv[1]);
  return g;
}
/** 一条两面都看得见的窄带（束带的带梢）：沿 pts 走，宽 w，面大致朝 n */
function strip(pts: THREE.Vector3[], w: number, n: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const side = (i: number) => new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).cross(n).normalize().multiplyScalar(w / 2);
  for (let i = 0; i < pts.length - 1; i++) {
    const s0 = side(i), s1 = side(i + 1);
    const a = pts[i].clone().sub(s0), b = pts[i].clone().add(s0), c = pts[i + 1].clone().add(s1), d = pts[i + 1].clone().sub(s1);
    for (const tri of [[a, b, c], [a, c, d], [a, c, b], [a, d, c]]) for (const p of tri) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return norm(g);
}

export const HEAD_UP = 0.152;   // 头心在颈根（头的转轴）上方多少
/** 头：原点在颈根（转轴），面朝 +z */
export function buildHead(low: boolean): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const ws = low ? 20 : 34, hs = low ? 14 : 24;
  const s = new THREE.SphereGeometry(1, ws, hs).rotateY(-Math.PI / 2);
  const p = s.attributes.position as THREE.BufferAttribute;
  const rx = 0.0975, ry = 0.121, rz = 0.104, DEG = 180 / Math.PI;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    const lon = Math.atan2(dx, dz) * DEG, lat = Math.asin(Math.max(-1, Math.min(1, dy))) * DEG;
    let x = dx * rx, y = dy * ry, z = dz * rz;
    if (dy < 0) { const k = Math.pow(-dy, 1.5); x *= 1 - 0.17 * k; z *= dz > 0 ? 1 - 0.06 * k : 1 - 0.13 * k; }
    if (dz < 0) z *= 1.07;
    if (dz > 0) {
      // 脸的体面：额与颧略平，鼻梁只一点起伏，眼窝极浅——宁可空，不要怪
      z *= 1 - 0.03 * (1 - Math.abs(dy)) * Math.exp(-(lon / 60) * (lon / 60));
      z += 0.0062 * Math.exp(-((lon / 7.5) ** 2) - (((lat + 10) / 13) ** 2));
      z -= 0.0022 * Math.exp(-(((Math.abs(lon) - 20) / 11) ** 2) - (((lat - 2) / 8) ** 2));
      z += 0.003 * Math.exp(-((lon / 26) ** 2) - (((lat + 60) / 18) ** 2));
    }
    // 头发比头皮高出一层
    const h = Math.max(0, Math.min(1, (lat - hairline(lon) + 2) / 5));
    const k = 1 + 0.062 * h * h * (3 - 2 * h);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  s.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [norm(s)];
  // 髻、束带、带梢
  const bun = new THREE.SphereGeometry(1, low ? 10 : 16, low ? 8 : 12).scale(0.046, 0.036, 0.046).rotateX(-0.28).translate(0, 0.136, -0.03);
  parts.push(uvAll(norm(bun), SW.hair));
  const bandG = new THREE.TorusGeometry(0.041, 0.0088, low ? 5 : 8, low ? 12 : 20).rotateX(Math.PI / 2).rotateX(-0.28).translate(0, 0.118, -0.024);
  parts.push(uvAll(norm(bandG), SW.ribbon));
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(sx * 0.012, 0.112, -0.064), new THREE.Vector3(sx * 0.02, 0.085, -0.094), new THREE.Vector3(sx * 0.03, 0.04, -0.118), new THREE.Vector3(sx * 0.036, -0.012, -0.124), new THREE.Vector3(sx * 0.04, -0.05, -0.12)];
    parts.push(uvAll(strip(pts, 0.02, new THREE.Vector3(sx * 0.25, 0.2, -1).normalize()), SW.ribbon));
  }
  // 耳、颈
  for (const sx of [-1, 1]) parts.push(uvAll(norm(new THREE.SphereGeometry(1, 8, 6).scale(0.0105, 0.027, 0.017).rotateY(sx * 0.25).translate(sx * 0.0935, -0.008, -0.004)), SW.skin));
  parts.push(uvAll(norm(new THREE.CylinderGeometry(0.042, 0.047, 0.13, low ? 10 : 16, 1, true).translate(0, -0.125, -0.002)), SW.skin));
  const g = merge(parts).translate(0, HEAD_UP, 0.008);
  const mat = enhance(new THREE.MeshStandardMaterial({ map: headTexture(low, false), roughness: 0.74, metalness: 0 }));
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'avatar:head';
  return { mesh, mat };
}

function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.scale(-1, 1, 1);
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) for (const a of [p, n, uv, c]) {
    const s = a.itemSize, arr = a.array as Float32Array;
    for (let k = 0; k < s; k++) { const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t; }
  }
  return g;
}
/** 手：原点在掌心，+y 指尖，+z 手心。右手的拇指在 +x 一侧，左手在 −x */
export function buildHands(low: boolean): { L: THREE.Mesh; R: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const seg = low ? 8 : 12;
  const make = () => merge([
    norm(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.035, 0.047, 0.0145).translate(0, -0.006, 0)),
    // 四指并拢，略向手心蜷
    norm(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.03, 0.043, 0.0115).rotateX(0.3).translate(0, 0.046, 0.0075)),
    norm(new THREE.SphereGeometry(1, 8, 6).scale(0.0105, 0.03, 0.0105).rotateZ(-0.62).rotateX(0.2).translate(0.036, 0.004, 0.008)),
    // 腕与一截小臂（平时藏在袖子里，手举起来袖子褪下去时露出来）
    norm(new THREE.CylinderGeometry(0.021, 0.027, 0.15, 8, 1, true).translate(0, -0.114, 0)),
  ]);
  const mat = enhance(new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.skin), roughness: 0.74 }));
  const R = new THREE.Mesh(make(), mat), L = new THREE.Mesh(mirrorX(make()), mat);
  for (const m of [L, R]) { m.castShadow = true; m.receiveShadow = true; }
  L.name = 'avatar:handL'; R.name = 'avatar:handR';
  return { L, R, mat };
}

/** 脚：千层底的黑布鞋。原点在踝的正下方的地面，脚尖朝 +z */
export function buildFeet(low: boolean): { L: THREE.Mesh; R: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const NZ = low ? 8 : 13, NS = low ? 8 : 14;
  const z0 = -0.062, z1 = 0.152;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const cw = new THREE.Color('#9c978c'), cb = new THREE.Color('#1b1b1e');
  for (let j = 0; j <= NZ; j++) {
    const t = j / NZ, z = z0 + (z1 - z0) * t;
    // 两头收圆：脚跟是半个圆，鞋头是圆而略翘的
    const eh = t < 0.16 ? Math.sqrt(Math.max(0, 1 - ((0.16 - t) / 0.16) ** 2)) : 1, et = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1;
    const w = (0.03 + 0.013 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * eh * et;
    const h = (0.056 - 0.028 * Math.pow(t, 1.4)) * (0.72 + 0.28 * eh) * (0.5 + 0.5 * et);
    const lift = 0.007 * Math.pow(Math.max(0, (t - 0.7) / 0.3), 2);          // 鞋尖略翘
    for (let i = 0; i <= NS; i++) {
      const a = (i / NS) * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
      const sy = Math.sign(sn) * Math.pow(Math.abs(sn), 0.6);
      const y = h * (0.5 + 0.5 * sy);
      pos.push(w * Math.sign(cs) * Math.pow(Math.abs(cs), 0.75), y + lift, z);
      const c = y < 0.0105 ? cw : cb; col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NS; i++) { const a = j * (NS + 1) + i, b = a + 1, c = a + NS + 2, d = a + NS + 1; idx.push(a, b, c, a, c, d); }
  const shoe = new THREE.BufferGeometry();
  shoe.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shoe.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  shoe.setIndex(idx); shoe.computeVertexNormals();
  // 袜筒不在这里：它要顺着小腿的方向（跪着时小腿是贴地的），在 figure.ts 的网里每帧现摆
  const make = () => norm(shoe.clone());
  const mat = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  const L = new THREE.Mesh(make(), mat), R = new THREE.Mesh(make(), mat);
  for (const m of [L, R]) { m.castShadow = true; m.receiveShadow = true; }
  L.name = 'avatar:footL'; R.name = 'avatar:footR';
  return { L, R, mat };
}

function hatTexture(low: boolean): THREE.CanvasTexture {
  const S = low ? 128 : 256;
  const [c, g] = canvas(S, S);
  const r = mulberry32(77);
  g.fillStyle = COL.straw; g.fillRect(0, 0, S, S);
  // 竹篾：一圈圈（横线）与放射的骨（竖线）
  const rows = 26;
  for (let i = 0; i < rows; i++) {
    const y = (i / rows) * S, h = S / rows;
    g.fillStyle = `rgba(92,74,40,${0.07 + (i % 2) * 0.06 + r() * 0.05})`; g.fillRect(0, y, S, h * 0.42);
    g.fillStyle = `rgba(255,240,200,${0.05 + r() * 0.05})`; g.fillRect(0, y + h * 0.5, S, h * 0.22);
  }
  const cols = 64;
  for (let i = 0; i < cols; i++) { g.fillStyle = `rgba(80,62,34,${0.05 + (i % 2) * 0.07 + r() * 0.04})`; g.fillRect((i / cols) * S, 0, S / cols * 0.4, S); }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,46,24' : '255,236,190'},${0.05 + r() * 0.08})`; g.fillRect(r() * S, r() * S, 2 + r() * 8, 1); }
  // 笠沿一道深的边、笠顶一个结
  g.fillStyle = 'rgba(70,54,28,0.6)'; g.fillRect(0, 0, S, S * 0.045);
  g.fillStyle = 'rgba(64,50,26,0.55)'; g.fillRect(0, S * 0.93, S, S * 0.07);
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
/**
 * 斗笠与系绳：挂在背上。坐标是「胸」的坐标（原点在胸心，x 朝左、y 沿脊向上、z 朝前）。
 * 笠面朝后，略歪；两根绳自笠沿上缘过两肩，在胸前领口下打一个结。
 */
const CORD = [0.34, 0.31, 0.27] as const;   // 乘在草色上：旧麻绳的灰褐
export function buildHat(low: boolean): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const seg = low ? 20 : 40;
  const R = 0.228, Hh = 0.095;
  const outer: Array<[number, number]> = [[0.0001, Hh + 0.004], [0.016, Hh + 0.003], [0.03, Hh - 0.004], [0.09, Hh * 0.7], [0.17, Hh * 0.36], [R - 0.012, 0.012], [R, 0.0], [R + 0.004, -0.004]];
  const top = new THREE.LatheGeometry(outer.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg);
  // 贴图的 v：0 在笠沿，1 在笠顶
  const inner: Array<[number, number]> = [[R + 0.004, -0.004], [R - 0.004, -0.008], [0.16, Hh * 0.33], [0.05, Hh * 0.78], [0.0001, Hh - 0.012]];
  const under = tint(norm(new THREE.LatheGeometry(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg)), 0.42, 0.4, 0.36);
  top.computeVertexNormals();
  const hat = merge([norm(top), under]);
  // 摆到背上：笠顶朝后略朝上，整个略歪
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0.012, -0.03, -0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(-(Math.PI / 2 - 0.2), 0.06, 0.14, 'YXZ')), new THREE.Vector3(1, 1, 1));
  hat.applyMatrix4(m);
  // 系绳：笠沿上缘 → 肩 → 胸前的结
  const cord = (sx: number) => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.1, 0.172, -0.126), new THREE.Vector3(sx * 0.098, 0.136, -0.06), new THREE.Vector3(sx * 0.088, 0.129, 0.012),
      new THREE.Vector3(sx * 0.062, 0.108, 0.076), new THREE.Vector3(sx * 0.028, 0.086, 0.099), new THREE.Vector3(0.002, 0.07, 0.105),
    ]);
    return tint(uvAll(norm(new THREE.TubeGeometry(c, low ? 10 : 18, 0.0024, 5, false)), [0.5, 0.5]), CORD[0], CORD[1], CORD[2]);
  };
  const knot = tint(uvAll(norm(new THREE.SphereGeometry(0.0062, 8, 6).translate(0.002, 0.069, 0.106)), [0.5, 0.5]), CORD[0], CORD[1], CORD[2]);
  const ends = [-1, 1].map((sx) => tint(uvAll(norm(new THREE.CylinderGeometry(0.002, 0.0014, 0.05, 5).rotateZ(sx * 0.22).translate(0.002 + sx * 0.007, 0.042, 0.109)), [0.5, 0.5]), CORD[0], CORD[1], CORD[2]));
  const g = merge([hat, cord(-1), cord(1), knot, ...ends]);
  const mat = enhance(new THREE.MeshStandardMaterial({ map: hatTexture(low), vertexColors: true, roughness: 0.82 }));
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'avatar:hat';
  return { mesh, mat };
}
