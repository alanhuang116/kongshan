/**
 * 佛座与背光（现搭的）：
 *   须弥座 —— 八角，上下叠涩、中间束腰，束腰每面一个壶门；朱漆，线脚与壶门描金；
 *   莲台   —— 覆莲一圈、束腰（连珠）、仰莲三重，瓣是有厚度、瓣尖外翻的曲面；贴金；
 *   背光   —— 舟形，微向前倾；头后圆光（莲花、连珠、弦纹）、身后身光、其外火焰纹，边缘是一簇簇焰尖。
 *             纹样是逐像素算出来的高度图 → 法线、明暗、微光。
 * 都以须弥座底面正中为原点（莲台自己的原点在它的底面）。
 */
import * as THREE from 'three';
import { Builder, type Geo, M, V, grid, lathe, merge, shade, sphere } from '../../core/geo';
import type { Mats } from '../../core/mats';
import { variant } from '../../core/mats';
import { clamp, fbm, smooth } from '../../core/rng';
import type { Quality } from '../../core/World';

export const PEDESTAL_H = 1.0;
export const LOTUS_H = 0.7;
const SEAT = PEDESTAL_H + LOTUS_H;

const asRec = (m: Mats) => m as unknown as Record<string, THREE.Material>;

// —————————————————— 须弥座 ——————————————————
export function buildPedestal(mats: Mats, _q: Quality): THREE.Group {
  const b = new Builder();
  const oct = (profile: Array<[number, number]>) => lathe(profile, 8, Math.PI / 8);
  // 自下而上：圭角、两层下叠涩、下枭、束腰、上枭、两层上叠涩、座面
  const body: Array<[number, number]> = [
    [1.9, 0], [1.9, 0.1], [1.78, 0.1], [1.78, 0.17], [1.66, 0.17], [1.66, 0.24], [1.44, 0.31],
    [1.36, 0.31], [1.36, 0.67], [1.44, 0.67], [1.62, 0.74], [1.62, 0.81], [1.74, 0.81], [1.74, 0.88], [1.87, 0.88], [1.87, 1.0], [0.001, 1.0],
  ];
  b.add('lacquerRed', shade(oct(body), (_x, y, _z, _nx, ny) => (ny < -0.3 ? 0.3 : 0.46 + 0.14 * y)));
  // 线脚描金：每一层的棱上一道细金边
  for (const [r, y] of [[1.905, 0.085], [1.785, 0.158], [1.665, 0.228], [1.625, 0.798], [1.745, 0.868], [1.878, 0.975]] as const) {
    b.add('gilt', oct([[r - 0.012, y - 0.012], [r + 0.004, y - 0.012], [r + 0.004, y + 0.012], [r - 0.012, y + 0.012]]));
  }
  // 束腰八面：壶门（凹进去的黑漆地 + 描金的门楣线）、转角小柱
  const ap = 1.36 * Math.cos(Math.PI / 8), fw = 2 * 1.36 * Math.sin(Math.PI / 8);
  const kun = (() => {
    // 壶门的轮廓：平底，两肩内收，顶上出尖
    const w = fw * 0.36, h = 0.25;
    const s = new THREE.Shape();
    s.moveTo(-w, 0); s.lineTo(w, 0); s.lineTo(w, h * 0.42);
    s.bezierCurveTo(w, h * 0.72, w * 0.62, h * 0.66, w * 0.5, h * 0.82);
    s.bezierCurveTo(w * 0.36, h * 1.0, w * 0.12, h * 0.86, 0, h * 1.08);
    s.bezierCurveTo(-w * 0.12, h * 0.86, -w * 0.36, h * 1.0, -w * 0.5, h * 0.82);
    s.bezierCurveTo(-w * 0.62, h * 0.66, -w, h * 0.72, -w, h * 0.42);
    s.closePath();
    return s;
  })();
  const kunFill = () => { const g = new THREE.ShapeGeometry(kun, 10); return toGeo(g); };
  const kunLine = () => {
    const pts = kun.getPoints(10), gs: Geo[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1], len = a.distanceTo(c);
      if (len < 1e-4) continue;
      const g = toGeo(new THREE.BoxGeometry(len + 0.012, 0.016, 0.014));
      g.rotateZ(Math.atan2(c.y - a.y, c.x - a.x)).translate((a.x + c.x) / 2, (a.y + c.y) / 2, 0);
      gs.push(g);
    }
    return merge(gs);
  };
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    b.push(M.mul(M.ry(a), M.t(0, 0.355, ap)));
    b.inst('kunFill', 'lacquer', kunFill, M.t(0, 0, 0.004));
    b.inst('kunLine', 'gilt', kunLine, M.t(0, 0, 0.012));
    b.pop();
    b.inst('kunPost', 'gilt', () => lathe([[0.03, 0], [0.042, 0.02], [0.03, 0.05], [0.03, 0.31], [0.042, 0.34], [0.03, 0.36]], 8), M.mul(M.ry(a + Math.PI / 8), M.t(0, 0.31, 1.365)));
  }
  return b.build(asRec(mats), { name: 'pedestal' });
}

function toGeo(g: THREE.BufferGeometry): Geo {
  const o = g.index ? g.toNonIndexed() : g;
  const n = o.attributes.position.count;
  if (!o.attributes.normal) o.computeVertexNormals();
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  o.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k);
  return o;
}

// —————————————————— 莲台 ——————————————————
/**
 * 一片莲瓣：根在原点，沿 +y 长 L，最宽 W，正面朝 +z。
 * belly 是瓣腹向外鼓多少，curl 是瓣尖向外翻多少，cup 是两侧向后卷多少。有厚度（前后两层面，边缘收薄）。
 */
export function petal(L: number, W: number, belly: number, curl: number, cup = 0.22, nu = 8, nv = 10): Geo {
  const front: THREE.Vector3[][] = [], back: THREE.Vector3[][] = [];
  const half = (v: number) => (W / 2) * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * v)), 0.72);
  for (let i = 0; i <= nu; i++) {
    const u = -1 + (2 * i) / nu, cf: THREE.Vector3[] = [], cb: THREE.Vector3[] = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv, w = half(v);
      const x = u * w;
      const z = belly * Math.sin(Math.PI * Math.pow(v, 0.8)) * (1 - 0.35 * u * u) + curl * Math.pow(v, 3.2) - cup * w * u * u + 0.02 * W * Math.pow(1 - Math.abs(u), 2) * (1 - v);
      const t = 0.045 * W * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - Math.pow(v, 5)) + 0.002;
      cf.push(V(x, v * L, z)); cb.push(V(x, v * L, z - t));
    }
    front.push(cf); back.push(cb);
  }
  const uv = (i: number, j: number): [number, number] => [(i / nu) * W, (j / nv) * L];
  const g = merge([grid(front, uv), grid(back, uv, true)]);
  // 根部暗（瓣与瓣叠着），瓣尖与中脊亮
  return shade(g, (x, y) => 0.5 + 0.5 * smooth(0.0, 0.55, y / L) + 0.06 * (1 - Math.min(1, Math.abs(x) / (W * 0.5))));
}

export function buildLotus(mats: Mats, q: Quality, gold: THREE.Material = mats.gold): THREE.Group {
  const b = new Builder();
  const lo = q.tier === 'low' || q.mobile;
  const seg = lo ? 32 : 56;
  // 芯：覆莲的坡、束腰、仰莲的碗、坐面
  b.add('g', shade(lathe([[1.5, 0], [1.53, 0.025], [1.5, 0.05], [1.3, 0.13], [1.06, 0.215], [0.98, 0.236], [0.96, 0.25], [0.96, 0.31], [1.0, 0.325], [1.14, 0.38], [1.34, 0.5], [1.43, 0.62], [1.43, 0.68], [1.4, 0.7], [0.001, 0.7]], seg), (_x, y) => 0.5 + 0.4 * smooth(0.3, 0.7, y)));
  // 连珠
  const nb = lo ? 40 : 56;
  const pu = lo ? 6 : 8, pv = lo ? 6 : 10;
  for (let i = 0; i < nb; i++) b.inst('bead', 'g', () => (lo ? sphere(0.031, 6, 4) : sphere(0.031, 8, 6)), M.mul(M.ry((i / nb) * Math.PI * 2), M.t(0, 0.28, 0.972)));
  // 莲瓣：n 片一圈；tilt 是瓣从竖直向外倒多少（弧度）；覆莲把瓣翻过来、正面朝上
  const ring = (key: string, n: number, off: number, r: number, y: number, tilt: number, geo: () => Geo, down = false) => {
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2;
      b.inst(key, 'g', geo, down ? M.mul(M.ry(a), M.t(0, y, r), M.rx(tilt), M.ry(Math.PI)) : M.mul(M.ry(a), M.t(0, y, r), M.rx(tilt)));
    }
  };
  const n = 16;
  // 仰莲三重：外圈矮而外张，里圈高而近竖
  ring('up1', n, 0, 1.05, 0.335, 1.0, () => petal(0.66, 0.6, 0.11, 0.1, 0.22, pu, pv));
  ring('up2', n, 0.5, 1.12, 0.36, 0.74, () => petal(0.6, 0.58, 0.09, 0.09, 0.22, pu, pv));
  ring('up3', n, 0, 1.2, 0.4, 0.5, () => petal(0.52, 0.54, 0.07, 0.08, 0.22, pu, pv));
  // 覆莲两重：贴着坡面垂下去，瓣尖微翘
  ring('dn1', n, 0.5, 1.0, 0.232, 1.9, () => petal(0.57, 0.6, 0.1, -0.06, 0.22, pu, pv), true);
  ring('dn2', n, 0, 0.99, 0.238, 1.72, () => petal(0.4, 0.5, 0.08, -0.04, 0.22, pu, Math.max(5, pv - 3)), true);
  return b.build({ ...asRec(mats), g: gold }, { name: 'lotus' });
}

// —————————————————— 背光 ——————————————————
const MW = 3.72, MY0 = PEDESTAL_H, MY1 = 5.62;
/** 头光、身光的圆心（座底坐标） */
const HEAD_C = SEAT + 2.63, BODY_C = SEAT + 1.2;

/** 背光的纹样：逐像素算 高度（0…1）、透不透（舟形 + 焰尖）、发光 */
function mandorlaMaps(q: Quality) {
  const W = q.tier === 'low' || q.mobile ? 384 : 768, H = Math.round((W * (MY1 - MY0)) / MW);
  const hgt = new Float32Array(W * H), alpha = new Float32Array(W * H), glow = new Float32Array(W * H);
  const ridge = (d: number, w: number) => Math.exp(-(d * d) / (w * w));
  const fract = (v: number) => v - Math.floor(v);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ((i + 0.5) / W - 0.5) * MW, y = MY0 + ((j + 0.5) / H) * (MY1 - MY0);
    const k = j * W + i;
    // —— 舟形的边：下面收、中间鼓、上面出尖；边上一簇簇向上的焰尖 ——
    const t = clamp((y - MY0) / (MY1 - MY0)), tm = 0.36;
    const shape = t < tm ? 0.68 + 0.32 * Math.sin((Math.PI / 2) * (t / tm)) : Math.pow(Math.cos((Math.PI / 2) * Math.pow((t - tm) / (1 - tm), 1.32)), 0.8);
    const base = 1.76 * shape;
    const ax = Math.abs(x);
    const tp = t * 25 + 1.6 * fbm(t * 7 + 3, 0.5, 2, 31);
    const tooth = Math.pow(fract(tp), 1.6) * (0.55 + 0.9 * fbm(Math.floor(tp) * 0.71 + 0.3, 1.7, 1, 37)) * smooth(0.06, 0.2, t);   // 沿边往上：渐渐探出去，到尖处骤然收回
    const edge = base * (0.885 + 0.115 * Math.min(1, tooth)) - 0.012;
    const inside = edge - ax;
    alpha[k] = clamp(inside / 0.01 + 0.5);
    // —— 圆光与身光 ——
    const rh = Math.hypot(x, y - HEAD_C), ah = Math.atan2(x, y - HEAD_C);
    const rb = Math.hypot(x * 0.96, y - BODY_C);
    let h = 0.3, g = 0;
    const inHead = rh < 0.8, inBody = rb < 1.3;
    if (inHead) {
      // 莲花心：十六瓣
      const pa = Math.abs(fract((ah / (Math.PI * 2)) * 16 + 0.5) - 0.5) * 2;             // 0 瓣中 … 1 瓣间
      const pr = clamp((rh - 0.2) / 0.22);
      const pet = rh < 0.46 && rh > 0.16 ? Math.pow(Math.sin(Math.PI * pr), 0.6) * (1 - Math.pow(pa, 2.2) * (0.35 + 0.65 * pr)) : 0;
      h = 0.34 + 0.34 * pet + 0.3 * ridge(rh - 0.17, 0.02);
      // 连珠一圈、弦纹数道
      const bd = Math.abs(fract((ah / (Math.PI * 2)) * 48 + 0.5) - 0.5) * 2;
      h += 0.42 * ridge(rh - 0.53, 0.026) * (1 - bd * bd);
      h += 0.36 * (ridge(rh - 0.48, 0.008) + ridge(rh - 0.585, 0.008) + ridge(rh - 0.74, 0.012) + ridge(rh - 0.785, 0.01));
      h += 0.14 * ridge(rh - 0.665, 0.05) * (0.5 + 0.5 * Math.sin(ah * 28 + 5 * Math.sin(ah * 7)));
      g = 0.5 * ridge(rh - 0.79, 0.03) + 0.2 * pet;
    } else if (inBody) {
      h = 0.3 + 0.36 * (ridge(rb - 1.285, 0.012) + ridge(rb - 1.2, 0.01) + ridge(rb - 1.1, 0.008));
      const ab = Math.atan2(x, y - BODY_C);
      const bd = Math.abs(fract((ab / (Math.PI * 2)) * 72 + 0.5) - 0.5) * 2;
      h += 0.38 * ridge(rb - 1.15, 0.024) * (1 - bd * bd);
      h += 0.12 * smooth(1.05, 0.2, rb) * (0.5 + 0.5 * Math.sin(ab * 34 + 6 * Math.sin(ab * 5) + rb * 9));
      g = 0.45 * ridge(rb - 1.29, 0.035);
    } else {
      // —— 火焰：自圆光外沿向上、向外舔出去的一道道细焰 ——
      const rn = ax / Math.max(base, 0.05);
      const w1 = fbm(x * 1.2 + 9, y * 0.9 + 2, 3, 7) - 0.5, w2 = fbm(x * 5 + 1, y * 3.4 + 7, 2, 11) - 0.5;
      const ph = (y * 1.75 - rn * 1.7 - 0.22 * Math.sin(rn * 6.5 + y * 2.4) + 0.8 * w1) * 3.1;
      const f = 1 - Math.abs(fract(ph) - 0.5) * 2;
      const li = Math.floor(ph), al = rn * 2.2 + y * 0.5 + fbm(li * 0.37 + 0.2, 3.1, 1, 41) * 3;
      const tongue = Math.pow(Math.sin(Math.PI * fract(al)), 0.45);                        // 每一道断成几条梭形的焰舌
      const crest = Math.pow(f, 2.2) * tongue * (0.75 + 0.5 * (w2 + 0.5));
      h = 0.24 + 0.52 * crest + 0.3 * ridge(inside - 0.085, 0.014) * smooth(0.02, 0.06, inside);
      g = 0.6 * Math.pow(f, 3) * tongue * smooth(0.03, 0.2, inside) + 0.4 * smooth(0.1, 0.0, inside);
    }
    // 板边收薄
    h *= 0.55 + 0.45 * smooth(0.0, 0.06, inside);
    hgt[k] = h; glow[k] = clamp(g) * alpha[k];
  }
  // 颜色（金，凹处沉）+ 透明、法线、发光
  const col = new Uint8Array(W * H * 4), nor = new Uint8Array(W * H * 4), emi = new Uint8Array(W * H * 4);
  const S = 2.4 * (W / 768);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, h = hgt[k];
    const xl = hgt[j * W + Math.max(0, i - 1)], xr = hgt[j * W + Math.min(W - 1, i + 1)], yd = hgt[Math.max(0, j - 1) * W + i], yu = hgt[Math.min(H - 1, j + 1) * W + i];
    const dx = (xr - xl) * S * 6, dy = (yu - yd) * S * 6, il = 1 / Math.hypot(dx, dy, 1);
    nor[k * 4] = (-dx * il * 0.5 + 0.5) * 255; nor[k * 4 + 1] = (-dy * il * 0.5 + 0.5) * 255; nor[k * 4 + 2] = (il * 0.5 + 0.5) * 255; nor[k * 4 + 3] = 255;
    const sh = 0.3 + 0.58 * smooth(0.22, 0.75, h), n = 0.92 + 0.16 * fbm(i * 0.02, j * 0.02, 3, 21);
    col[k * 4] = clamp(0.96 * sh * n) * 255; col[k * 4 + 1] = clamp(0.72 * sh * n * (0.9 + 0.1 * sh)) * 255; col[k * 4 + 2] = clamp(0.34 * sh * n * (0.8 + 0.2 * sh)) * 255;
    col[k * 4 + 3] = alpha[k] * 255;
    const e = glow[k] * 255;
    emi[k * 4] = e; emi[k * 4 + 1] = e; emi[k * 4 + 2] = e; emi[k * 4 + 3] = 255;
  }
  const tex = (d: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { map: tex(col, true), normalMap: tex(nor, false), emissiveMap: tex(emi, false) };
}

export function buildMandorla(mats: Mats, q: Quality, gold: THREE.MeshStandardMaterial = mats.gold): { group: THREE.Group; glow: THREE.MeshStandardMaterial; top: number } {
  const maps = mandorlaMaps(q);
  const nu = 24, nv = 40, pts: THREE.Vector3[][] = [];
  // 板：自莲台后沿立起，越往上越向前倾，两侧略向前合抱
  const zAt = (x: number, y: number) => -1.68 + 0.032 * (y - MY0) * (y - MY0) + 0.07 * (x / (MW / 2)) * (x / (MW / 2));
  for (let i = 0; i <= nu; i++) {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= nv; j++) { const x = (i / nu - 0.5) * MW, y = MY0 + (j / nv) * (MY1 - MY0); row.push(V(x, y, zAt(x, y))); }
    pts.push(row);
  }
  const geo = grid(pts, (i, j) => [i / nu, j / nv]);
  const glow = variant(gold, {
    map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(1, 1), roughnessMap: null, metalnessMap: null, metalness: 0.9, roughness: 0.44, color: 0xffffff,
    emissive: 0x8a4d1c, emissiveMap: maps.emissiveMap, emissiveIntensity: 0.5, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, glow);
  mesh.name = 'mandorla'; mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = 'mandorla';
  group.add(mesh);
  // 板的厚：后面再叠两层同样轮廓的暗金（侧面看不至于是一张纸）
  const backMat = variant(gold, { map: maps.map, normalMap: null, roughnessMap: null, metalnessMap: null, metalness: 0.6, roughness: 0.7, color: 0x6b4a26, alphaTest: 0.5, side: THREE.DoubleSide });
  for (const dz of [-0.03, -0.06]) {
    const m2 = new THREE.Mesh(geo, backMat);
    m2.position.z = dz; m2.name = 'mandorla-back'; m2.castShadow = false; m2.receiveShadow = true;
    group.add(m2);
  }
  return { group, glow, top: MY1 };
}
