/**
 * 天时：一天十二时辰的光、四种天气、四季的日照。
 * 做法：一张「时刻 → 天色、雾色、日色、天光……」的表（以日出为 6、日落为 18 的「相位」来记，四季昼夜长短不同时把真实时刻折算进去），
 * 相邻两行之间插值；再叠上天气（雾、雨、雪把天压灰、把日光收掉、把雾加浓）。
 * 换时辰时不是硬切，而是让时刻自己走过去（几秒里看得到日影移动）。
 */
import * as THREE from 'three';
import { shared } from '../core/mats';
import { clamp, lerp, smooth } from '../core/rng';
import { Sky } from './sky';

export type Weather = 'clear' | 'mist' | 'rain' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface Key {
  h: number; zen: number; hor: number; fog: number; fogSun: number; sun: number; sunI: number; sky: number; gnd: number; hemiI: number;
  expo: number; stars: number; lamp: number; fogD: number; cl: number; cs: number; ridge: number; disk: number; env: number; bloom: number;
}
const NIGHT: Omit<Key, 'h'> = { zen: 0x080b12, hor: 0x161d28, fog: 0x121820, fogSun: 0x2e3947, sun: 0xa9bcd6, sunI: 0.95, sky: 0x3a4658, gnd: 0x101216, hemiI: 0.85, expo: 1.42, stars: 1, lamp: 1, fogD: 1.0, cl: 0x2c3644, cs: 0x10141a, ridge: 0x07090c, disk: 0, env: 0.55, bloom: 0.9 };
const KEYS: Key[] = [
  { h: 0, ...NIGHT },
  { h: 4.9, ...NIGHT },
  { h: 5.65, zen: 0x1a2740, hor: 0x5a6880, fog: 0x3f4a5c, fogSun: 0x907f84, sun: 0xa9bcd6, sunI: 0.06, sky: 0x58687f, gnd: 0x17191c, hemiI: 0.95, expo: 1.15, stars: 0.35, lamp: 0.85, fogD: 1.35, cl: 0x8f8590, cs: 0x3a4252, ridge: 0x10161c, disk: 0.25, env: 0.7, bloom: 0.8 },
  { h: 6.2, zen: 0x46607f, hor: 0xf1c199, fog: 0xbdaeaa, fogSun: 0xffc994, sun: 0xffb580, sunI: 2.1, sky: 0x8f9eb8, gnd: 0x3a332c, hemiI: 0.9, expo: 1.0, stars: 0, lamp: 0.25, fogD: 1.55, cl: 0xffd9b8, cs: 0x8a8799, ridge: 0x2a3138, disk: 1, env: 0.9, bloom: 0.75 },
  { h: 7.6, zen: 0x5a86be, hor: 0xf3dfc6, fog: 0xdcd3cb, fogSun: 0xffe7c4, sun: 0xffdcb0, sunI: 3.1, sky: 0xa9bdd6, gnd: 0x4a463c, hemiI: 1.0, expo: 1.0, stars: 0, lamp: 0, fogD: 1.25, cl: 0xffffff, cs: 0xb9c0cc, ridge: 0x33434a, disk: 1, env: 1, bloom: 0.55 },
  { h: 10.5, zen: 0x5f93cf, hor: 0xdfe9f0, fog: 0xd3dde4, fogSun: 0xfff4e0, sun: 0xfff2df, sunI: 3.7, sky: 0xbcd0e6, gnd: 0x55554a, hemiI: 1.05, expo: 1.0, stars: 0, lamp: 0, fogD: 0.9, cl: 0xffffff, cs: 0xc0cad4, ridge: 0x34474e, disk: 1, env: 1, bloom: 0.45 },
  { h: 13.5, zen: 0x5b90cf, hor: 0xe1eaf0, fog: 0xd6dfe5, fogSun: 0xfff7ea, sun: 0xfff8ee, sunI: 3.9, sky: 0xbcd0e6, gnd: 0x58574c, hemiI: 1.05, expo: 1.0, stars: 0, lamp: 0, fogD: 0.85, cl: 0xffffff, cs: 0xc0cad4, ridge: 0x34474e, disk: 1, env: 1, bloom: 0.45 },
  { h: 16.2, zen: 0x5e8cc4, hor: 0xeadfcd, fog: 0xd9d3c8, fogSun: 0xffe9c4, sun: 0xffe3b5, sunI: 3.3, sky: 0xb4c4d8, gnd: 0x55504a, hemiI: 1.0, expo: 1.0, stars: 0, lamp: 0, fogD: 1.0, cl: 0xfff6e8, cs: 0xb4b8c4, ridge: 0x33424a, disk: 1, env: 1, bloom: 0.5 },
  { h: 17.6, zen: 0x3f566f, hor: 0xf2b27c, fog: 0xc6a690, fogSun: 0xffb06c, sun: 0xffa066, sunI: 2.2, sky: 0x8d95a3, gnd: 0x3c322b, hemiI: 0.85, expo: 1.0, stars: 0, lamp: 0.35, fogD: 1.3, cl: 0xffc8a0, cs: 0x7d7f8a, ridge: 0x2a2e33, disk: 1, env: 0.9, bloom: 0.75 },
  { h: 18.35, zen: 0x25334a, hor: 0x947c70, fog: 0x5c5a5e, fogSun: 0xb5886e, sun: 0xa9bcd6, sunI: 0.06, sky: 0x5c6779, gnd: 0x1c1a1b, hemiI: 0.85, expo: 1.1, stars: 0.15, lamp: 0.9, fogD: 1.3, cl: 0xa07e72, cs: 0x3c424e, ridge: 0x14171b, disk: 0.3, env: 0.75, bloom: 0.85 },
  { h: 19.3, zen: 0x101826, hor: 0x2e3848, fog: 0x212a35, fogSun: 0x3c4553, sun: 0xa9bcd6, sunI: 0.6, sky: 0x3c485c, gnd: 0x101214, hemiI: 0.8, expo: 1.3, stars: 0.8, lamp: 1, fogD: 1.1, cl: 0x343e4e, cs: 0x141a22, ridge: 0x0a0d10, disk: 0, env: 0.6, bloom: 0.9 },
  { h: 20.5, ...NIGHT },
  { h: 24, ...NIGHT },
];
const COLS = ['zen', 'hor', 'fog', 'fogSun', 'sun', 'sky', 'gnd', 'cl', 'cs', 'ridge'] as const;
const NUMS = ['sunI', 'hemiI', 'expo', 'stars', 'lamp', 'fogD', 'disk', 'env', 'bloom'] as const;
type ColK = (typeof COLS)[number]; type NumK = (typeof NUMS)[number];
type State = Record<ColK, THREE.Color> & Record<NumK, number>;

/** 四季：日出、日落（当地时刻）、正午日高（度） */
const SUN: Record<Season, { rise: number; set: number; elev: number }> = {
  spring: { rise: 6.0, set: 18.2, elev: 58 },
  summer: { rise: 5.1, set: 19.1, elev: 74 },
  autumn: { rise: 6.3, set: 17.5, elev: 50 },
  winter: { rise: 7.0, set: 17.0, elev: 36 },
};

export class Atmos {
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  /** 当前显示的时刻（当地 0–24）与目标时刻 */
  hour = 9; private goal = 9;
  season: Season = 'autumn';
  weather: Weather = 'clear';
  /** 各天气的权重 0…1（渐变用） */
  w = { mist: 0, rain: 0, snow: 0 };
  /** 灯该亮几成、夜有几成、此刻的曝光与泛光强度、日（月）光的方向 */
  lamp = 0; night = 0; exposure = 1; bloom = 0.5; envI = 1;
  lightDir = new THREE.Vector3(0.5, 0.7, 0.5);
  moonPhase = 0.5;
  /** 影子、环境反射要不要重算 */
  shadowDirty = true; envDirty = true;
  private st: State; private lastEnvH = -99; private lastShadowKey = '';
  private lamps: Array<{ apply: (k: number) => void }> = [];
  private pmrem: THREE.PMREMGenerator | null = null; private envRT: THREE.WebGLRenderTarget | null = null; private envScene = new THREE.Scene();

  constructor(private scene: THREE.Scene, shadowSize: number) {
    const mk = () => Object.fromEntries([...COLS.map((k) => [k, new THREE.Color()]), ...NUMS.map((k) => [k, 0])]) as State;
    this.st = mk();
    scene.add(this.sky.mesh, this.sun, this.sun.target, this.hemi);
    const s = this.sun.shadow;
    this.sun.castShadow = shadowSize > 0;
    s.mapSize.set(shadowSize || 512, shadowSize || 512);
    s.camera.near = 20; s.camera.far = 420;
    s.camera.left = -62; s.camera.right = 62; s.camera.top = 62; s.camera.bottom = -62;
    s.bias = -0.0005; s.normalBias = 0.045; s.radius = 3;
    this.sun.target.position.set(0, 2, 6);
    const skyClone = new THREE.Mesh(this.sky.mesh.geometry, this.sky.mesh.material);
    skyClone.frustumCulled = false;
    this.envScene.add(skyClone);
  }

  /** 登记一盏灯：k（0…1）变了就调它 */
  addLamp(apply: (k: number) => void) { this.lamps.push({ apply }); apply(this.lamp); }

  /** 立刻跳到某个时刻（instant）或让时刻走过去 */
  setHour(h: number, instant = false) { this.goal = ((h % 24) + 24) % 24; if (instant) this.hour = this.goal; }
  setWeather(w: Weather, instant = false) {
    this.weather = w;
    if (instant) { this.w.mist = w === 'mist' ? 1 : 0; this.w.rain = w === 'rain' ? 1 : 0; this.w.snow = w === 'snow' ? 1 : 0; }
  }
  setSeason(s: Season) { this.season = s; this.envDirty = true; this.shadowDirty = true; }
  get transitioning() { return Math.abs(this.hour - this.goal) > 1e-3; }

  /** 真实时刻 → 相位（日出 6、日落 18） */
  phase(h: number): number {
    const { rise, set } = SUN[this.season];
    if (h >= rise && h <= set) return 6 + ((h - rise) / (set - rise)) * 12;
    const hh = h < rise ? h + 24 : h;
    return (18 + ((hh - set) / (rise + 24 - set)) * 12) % 24;
  }

  private sample(ph: number) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= ph) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    let t = clamp((ph - a.h) / (b.h - a.h || 1));
    t = t * t * (3 - 2 * t);
    const st = this.st, ca = new THREE.Color(), cb = new THREE.Color();
    for (const k of COLS) st[k].copy(ca.setHex(a[k])).lerp(cb.setHex(b[k]), t);
    for (const k of NUMS) st[k] = lerp(a[k], b[k], t);
  }

  update(dt: number) {
    dt = Math.max(0, dt);
    // 时刻走向目标：走近路，约四五秒走完
    if (this.hour !== this.goal) {
      let d = this.goal - this.hour;
      if (d > 12) d -= 24; else if (d < -12) d += 24;
      const step = Math.sign(d) * Math.max(Math.abs(d) * 1.6, 0.8) * dt;
      this.hour = Math.abs(step) >= Math.abs(d) ? this.goal : (this.hour + step + 24) % 24;
    }
    for (const k of ['mist', 'rain', 'snow'] as const) {
      const g = this.weather === k ? 1 : 0;
      this.w[k] += clamp(g - this.w[k], -dt / 5, dt / 5);
    }
    const ph = this.phase(this.hour);
    this.sample(ph);
    const st = this.st, { mist, rain, snow } = this.w;
    const over = Math.max(rain, snow * 0.85);

    // —— 日与月 ——
    const el = (SUN[this.season].elev * Math.PI) / 180;
    const a = ((ph - 6) / 12) * Math.PI;
    const sunElev = Math.asin(Math.sin(a) * Math.sin(el));
    const sunDir = new THREE.Vector3(Math.cos(sunElev) * Math.cos(a), Math.sin(sunElev), Math.cos(sunElev) * Math.sin(Math.min(Math.max(a, 0.25), Math.PI - 0.25)) * 0.9 + 0.12).normalize();
    const nb = ((((ph - 18) % 24) + 24) % 24) / 12 * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(nb) * 0.7, 0.42 + 0.3 * Math.sin(nb), 0.5 + 0.22 * Math.sin(nb)).normalize();
    const day = ph > 5.65 && ph < 18.35;
    this.night = 1 - smooth(5.2, 6.4, ph) * (1 - smooth(17.6, 18.9, ph));
    this.lightDir.copy(day ? sunDir : moonDir);
    // 贴近地平时日光别太平（影子会拉得无限长）
    if (this.lightDir.y < 0.16) { this.lightDir.y = 0.16; this.lightDir.normalize(); }
    const moonLit = 0.62 + 0.38 * Math.sin(Math.PI * this.moonPhase);

    // —— 天气把天压灰 ——
    const lum = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    const grey = new THREE.Color();
    const toGrey = (c: THREE.Color, k: number, gain = 1) => { const l = lum(c) * gain; c.lerp(grey.setRGB(l * 0.97, l, l * 1.03), k); };
    toGrey(st.zen, over * 0.86, 1.25); toGrey(st.hor, over * 0.8, 0.95); toGrey(st.fog, over * 0.7, 1.0); toGrey(st.fogSun, over * 0.9, 0.8);
    toGrey(st.sky, over * 0.7, 1.0); toGrey(st.cl, over, 0.8); toGrey(st.cs, over, 0.8);
    st.zen.lerp(st.fog, mist * 0.55); st.hor.lerp(st.fog, mist * 0.6);
    if (snow > 0) { st.fog.lerp(grey.setRGB(0.86, 0.88, 0.9).multiplyScalar(0.25 + 0.75 * (1 - this.night)), snow * 0.5); }
    const sunI = st.sunI * (1 - 0.5 * mist) * (1 - 0.82 * rain) * (1 - 0.6 * snow) * (day ? 1 : moonLit);
    const hemiI = st.hemiI * (1 - 0.12 * rain) * (1 + 0.1 * snow);
    const fogD = st.fogD * (1 + 2.6 * mist + 1.5 * rain + 1.9 * snow);

    // —— 写出去 ——
    const u = this.sky.u;
    u.uZenith.value.copy(st.zen); u.uHorizon.value.copy(st.hor);
    u.uSunColor.value.copy(st.sun).multiplyScalar(day ? 1 : 0);
    u.uSunPos.value.copy(sunDir); u.uMoonDir.value.copy(moonDir);
    u.uSunDisk.value = st.disk * (1 - 0.75 * mist) * (1 - over);
    u.uMoonOn.value = this.night * (1 - over) * (1 - 0.6 * mist);
    u.uMoonPhase.value = this.moonPhase;
    u.uStars.value = st.stars * (1 - over) * (1 - 0.7 * mist);
    u.uCloud.value = clamp(0.34 + 0.3 * mist + over * 0.7);
    u.uCloudLit.value.copy(st.cl); u.uCloudShade.value.copy(st.cs);
    u.uRidgeNear.value.copy(st.ridge);
    u.uGround.value.copy(st.gnd).multiplyScalar(0.55 + 0.25 * snow);
    u.uHaze.value = 1 + 1.6 * mist + 1.2 * over;
    shared.uFogColor.value.copy(st.fog); shared.uFogSun.value.copy(st.fogSun);
    shared.uFogP.value.x = 0.0042 * fogD; shared.uFogDist.value = 0.00042 * fogD * (1 + 2.2 * mist + 2.6 * rain + 3.2 * snow);
    shared.uSunDir.value.copy(this.lightDir);
    shared.uWet.value = rain; shared.uSnow.value = snow;

    this.sun.color.copy(st.sun); this.sun.intensity = sunI;
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.lightDir, 200);
    this.hemi.color.copy(st.sky); this.hemi.groundColor.copy(st.gnd); this.hemi.intensity = hemiI;
    this.exposure = st.expo * (1 + 0.12 * over);
    this.bloom = st.bloom;
    this.envI = st.env * (1 - 0.25 * over);
    if (Math.abs(st.lamp - this.lamp) > 0.004) { this.lamp = st.lamp; for (const l of this.lamps) l.apply(this.lamp); }

    const key = `${this.lightDir.x.toFixed(3)},${this.lightDir.y.toFixed(3)},${this.lightDir.z.toFixed(3)}`;
    if (key !== this.lastShadowKey) { this.lastShadowKey = key; this.shadowDirty = true; }
    const envKey = this.hour + over * 3 + mist * 5;
    if (Math.abs(envKey - this.lastEnvH) > 0.12) { this.lastEnvH = envKey; this.envDirty = true; }
  }

  /** 环境反射：把天烘成一张模糊的环境贴图（金、铜、湿石板上映的就是它）。只在天色变了以后重烘 */
  bakeEnv(renderer: THREE.WebGLRenderer) {
    if (!this.envDirty) return;
    this.envDirty = false;
    this.pmrem ??= new THREE.PMREMGenerator(renderer);
    const old = this.envRT;
    const tm = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    this.sky.u.uEnv.value = 1;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100);
    this.sky.u.uEnv.value = 0;
    renderer.toneMapping = tm;
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.envI;
    old?.dispose();
  }
  dispose() { this.envRT?.dispose(); this.pmrem?.dispose(); }
}
