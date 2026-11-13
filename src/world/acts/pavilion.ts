/**
 * 观物亭里的三件事：
 *   观物 —— 坐在西边的凳上。看云起（远山半腰的云慢慢升上去）、听蝉鸣（夏天）、察草虫（池边的草）、候星移（夜里，斗转星移）；
 *           看完了，邵雍论「观物」的一句话。
 *   小睡 —— 午后在北凳上打个盹，醒来写两句诗（「午后在亭中打盹，醒来写两句诗」）。
 *   八卦 —— 亭心地上那块先天八卦盘：站上去，按先天之序转身看八方——乾南、兑东南、离东、震东北、巽西南、坎西、艮西北、坤北，
 *           每一方是这一片山水里的一样东西（长空、河湾、日出、飞瀑、风、溪口、石峰、邙山）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { FX_LAYER, FX_PARS, U } from '../ink/ink';
import type { Act } from './types';
import { anchor, pairFor, sayingFor, shot, sitDown, TRIGRAMS, V, yiWord } from './lib';
import { SITE } from '../site';

type St = Record<string, unknown>;
function base(k: Anlewo) {
  const state: St = {};
  const set = (p: St) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  return { state, set };
}

// —— 观物 ——
type Mode = 'cloud' | 'cicada' | 'insect' | 'star' | 'rain';
const MODE_NAME: Record<Mode, string> = { cloud: '看云起', cicada: '听蝉鸣', insect: '察草虫', star: '候星移', rain: '听雨' };
function guan(k: Anlewo): Act | null {
  const seat = anchor(k, 'pavilionSeat');
  if (!seat) return null;
  const { state, set } = base(k);
  const P = SITE.pond;
  let mode: Mode | null = null, t = 0;
  const cloud0 = new THREE.Vector4();
  const avail = (): Mode[] => {
    const a = k.atmos, out: Mode[] = [];
    if (a.night > 0.6) { if (a.w.rain + a.w.mist + a.w.snow < 0.4) out.push('star'); }
    else {
      if (a.w.rain > 0.5) out.push('rain');
      if (a.w.rain < 0.5) out.push('cloud');
      if (k.season === 'summer' && a.w.rain < 0.5) out.push('cicada');
      if (k.season !== 'winter') out.push('insect');
    }
    if (!out.length) out.push(a.night > 0.6 ? 'rain' : 'cloud');
    return out;
  };
  const menu = () => { mode = null; set({ kind: 'guan', title: '观物', hint: '看云起，听蝉鸣，察草虫，候星移', choices: [...avail().map((m) => ({ id: m, label: MODE_NAME[m] })), { id: 'done', label: '起身' }] }); };
  const look = (m: Mode) => {
    const s = seat.position;
    if (m === 'star') { const d = k.atmos.sky.star(7).clone(); d.y = Math.max(0.42, d.y); d.normalize(); const pos = V(s.x + 1.4, s.y + 0.9, s.z + 4.6); return { pos, look: pos.clone().addScaledVector(d, 40), fov: 62, yaw: 20, up: 16, down: 8 }; }
    if (m === 'insect') return shot(V(s.x + 2.4, s.y - 0.35, s.z + 0.6), -Math.PI / 2 + 0.5, 1.4, 0.5, -0.1, 36);
    if (m === 'cicada') return { pos: V(s.x - 0.7, s.y + 0.6, s.z + 0.5), look: V(P.x + P.rx * 0.6, s.y + 2.2, P.z - P.rz - 2), fov: 44, yaw: 20, up: 12, down: 8 };
    if (m === 'rain') return { pos: V(s.x - 0.7, s.y + 0.6, s.z + 0.4), look: V(P.x, P.y + 0.3, P.z), fov: 46, yaw: 22, up: 10, down: 10 };
    return { pos: V(s.x - 0.75, s.y + 0.6, s.z + 0.35), look: V(s.x + 60, s.y + 3.2, s.z + 22), fov: 46, yaw: 24, up: 12, down: 6 };
  };
  const end = () => {
    if (!mode) return;
    const sy = sayingFor(mode === 'rain' ? 'water' : mode);
    k.log({ kind: 'guan', text: MODE_NAME[mode] });
    set({ kind: 'read', title: MODE_NAME[mode], text: sy?.text ?? '以物观物。', source: sy?.source, gloss: sy?.gloss, choices: [{ id: 'again', label: '再坐一会儿' }, { id: 'done', label: '起身' }] });
    mode = null;
  };
  const resetFx = () => { U.uCloud.value.copy(cloud0); k.atmos.starShift = 0; k.focus = null; };
  return {
    id: 'guan', name: '观物', anchor: seat.position.clone().add(V(0.6, 1.0, 0)), spot: { x: seat.position.x + 0.55, z: seat.position.z, yaw: seat.rotation.y }, radius: 2.0, state, noZoom: true,
    enter() {
      cloud0.copy(U.uCloud.value);
      sitDown(k, seat, { ground: k.player.pos.y });
      k.player.av.setHands('lap');
      k.nav.setPose(look('cloud'), 1.8);
      menu();
    },
    exit() { resetFx(); k.player.av.lookAt(null); k.world.fpsCap = 0; },
    update(dt) {
      if (!mode) return;
      t += dt;
      const av = k.player.av, e = Math.min(1, t / 14);
      if (mode === 'cloud') {
        // 云起：远山半腰那一带云，慢慢往上升、变浓
        U.uCloud.value.set(Math.min(1, cloud0.x + 0.25 * e), cloud0.y + 320 * e, cloud0.z + 480 * e, cloud0.w);
        av.lookAt(V(seat.position.x + 60, seat.position.y + 6 + 8 * e, seat.position.z + 24));
      } else if (mode === 'star') {
        // 候星移：一个时辰一个时辰地过去，斗柄绕着北极星转
        k.atmos.starShift = 6 * e * e * (3 - 2 * e);
        av.lookAt(k.player.pos.clone().add(k.atmos.sky.star(7).clone().multiplyScalar(30)));
      } else if (mode === 'insect') av.bow = 0.25;
      state.progress = e; if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) k.emitAct();
      if (t >= 14.5) end();
    },
    input: { tap: () => { if (mode && t > 3) { t = 14.5; } return true; } },
    cmd(c) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'again') { resetFx(); menu(); k.nav.setPose(look('cloud'), 1.2); return; }
      if (c in MODE_NAME) {
        mode = c as Mode; t = 0;
        resetFx(); cloud0.copy(U.uCloud.value);
        if (mode === 'cicada') k.focus = 'cicada'; else if (mode === 'rain') k.focus = 'rain';
        k.nav.setPose(look(mode), 2.2);
        k.world.fpsCap = 30;
        set({ kind: 'guan', title: MODE_NAME[mode], hint: mode === 'star' ? '一夜的星，在这一会儿里转过去' : '不必做什么。看着就好', progress: 0 });
      }
    },
  };
}

// —— 小睡 ——
function nap(k: Anlewo): Act | null {
  const seat = anchor(k, 'pavilionSeatN');
  if (!seat) return null;
  const { state, set } = base(k);
  let t = 0, phase: 'doze' | 'sleep' | 'wake' | 'write' | 'done' = 'doze', to = 0;
  return {
    id: 'nap', name: '小睡', anchor: seat.position.clone().add(V(0, 1.0, 0.5)), spot: { x: seat.position.x, z: seat.position.z + 0.55, yaw: seat.rotation.y }, radius: 2.0, state, noZoom: true,
    on: () => k.atmos.night < 0.3 && k.atmos.hour > 11.5 && k.atmos.hour < 17.5,
    enter() {
      t = 0; phase = 'doze'; to = Math.min(k.atmos.hour + 1.3, k.hourFor('dusk') - 0.3);
      sitDown(k, seat, { ground: k.player.pos.y });
      k.player.av.setHands('lap');
      k.nav.setPose(shot(seat.position, 0.6, 3.2, 0.9, 0.2, 40, { yaw: 18, up: 10, down: 8 }), 1.8);
      set({ kind: 'rest', title: '小睡', hint: '午后，风从池上来' });
    },
    exit() { k.veil = 0; k.world.fpsCap = 0; k.player.av.bow = 0; k.player.av.reach('R', null); },
    update(dt) {
      t += dt;
      const av = k.player.av;
      if (phase === 'doze') { av.bow = Math.min(0.45, t * 0.15); if (t > 3) { phase = 'sleep'; t = 0; k.world.fpsCap = 30; } }
      else if (phase === 'sleep') { k.veil = Math.min(0.92, t / 1.8); if (t > 1.9 && t - dt <= 1.9) k.passTo(to); if (t > 2.6) { phase = 'wake'; t = 0; } }
      else if (phase === 'wake') {
        k.veil = Math.max(0, 0.92 - t / 1.6); av.bow = Math.max(0, 0.45 - t * 0.3);
        if (t > 1.8) {
          k.veil = 0; k.world.fpsCap = 0; phase = 'write';
          const p = pairFor(k, ['noon', 'day']);
          if (!p) { phase = 'done'; set({ kind: 'read', title: '醒来', text: '醒了。池上有风。', choices: [{ id: 'done', label: '起身' }] }); return; }
          state.pair = p;
          set({ kind: 'write', title: '醒来写两句', model: [p.a, p.b], from: p.from, source: p.source, hint: '醒来，得两句' });
          state.pair = p;
        }
      } else if (phase === 'write') {
        // 纸搁在膝上，右手慢慢地写
        const knee = seat.position.clone().add(V(Math.sin(seat.rotation.y) * 0.3, 0.12, Math.cos(seat.rotation.y) * 0.3));
        av.reach('R', knee.add(V(0.05 * Math.sin(t * 1.4), 0.01 * Math.max(0, Math.sin(t * 6)), 0.04 * Math.sin(t * 0.7))), { rate: 8 });
        av.bow = 0.2;
      }
    },
    cmd(c) {
      if (c === 'written' && phase === 'write') {
        const p = state.pair as { a: string; b: string; from: string; source: string };
        phase = 'done'; k.player.av.reach('R', null); k.player.av.bow = 0;
        k.log({ kind: 'poem', text: `${p.a}，${p.b}。` });
        set({ kind: 'read', title: '醒来写两句', lines: [p.a, p.b], source: `${p.from}　${p.source}`, choices: [{ id: 'done', label: '起身' }] });
      } else if (c === 'done') k.exitAct();
    },
  } as Act & { on(): boolean };
}

// —— 八卦盘 ——
/** 先天之序：乾一兑二离三震四巽五坎六艮七坤八；方位（度，从正南往东量） */
const ORDER: Array<{ id: string; az: number; dir: string; scene: string }> = [
  { id: 'qian', az: 0, dir: '南', scene: '南望伊阙，长空一片' }, { id: 'dui', az: 45, dir: '东南', scene: '东南是伊水的河湾，泽地，渡口' },
  { id: 'li', az: 90, dir: '东', scene: '东边日出的地方，村里的烟火' }, { id: 'zhen', az: 135, dir: '东北', scene: '东北那道飞瀑，水声如雷' },
  { id: 'xun', az: -45, dir: '西南', scene: '西南一片平畴，风从那边来' }, { id: 'kan', az: -90, dir: '西', scene: '西边溪水出山的峡口' },
  { id: 'gen', az: -135, dir: '西北', scene: '西北最高的石峰，止而不动' }, { id: 'kun', az: 180, dir: '北', scene: '北面邙山，厚而低，载着这一片' },
];
const FALLBACK: Record<string, [string, string, string, [number, number, number]]> = {
  qian: ['乾', '天', '健', [1, 1, 1]], dui: ['兑', '泽', '说', [1, 1, 0]], li: ['离', '火', '丽', [1, 0, 1]], zhen: ['震', '雷', '动', [1, 0, 0]],
  xun: ['巽', '风', '入', [0, 1, 1]], kan: ['坎', '水', '陷', [0, 1, 0]], gen: ['艮', '山', '止', [0, 0, 1]], kun: ['坤', '地', '顺', [0, 0, 0]],
};
/** 天上的一个卦象：三爻（自下而上）与卦名，画在勾完线之后的那一层 */
function glyph(lines: [number, number, number], name: string, image: string): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 330 - i * 92;
    if (lines[i]) { g.fillRect(96, y - 22, 320, 44); }
    else { g.fillRect(96, y - 22, 132, 44); g.fillRect(284, y - 22, 132, 44); }
  }
  g.font = '500 120px "Ma Shan Zheng", "LXGW WenKai", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${name}·${image}`, 256, 500);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uInk: U.uInk, uLight: U.uLight, uNight: U.uNight, uA: { value: 0 }, tDepth: U.tDepth, uView: U.uView }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `${FX_PARS}
uniform sampler2D map; uniform vec3 uInk; uniform vec3 uLight; uniform float uNight; uniform float uA; varying vec2 vUv;
void main() { float a = texture2D(map, vUv).a * fxSeen(24.0, 3.0); gl_FragColor = vec4(mix(uInk, uLight, uNight), a * uA * mix(0.55, 0.8, uNight)); }`,
  }));
  m.layers.set(FX_LAYER); m.frustumCulled = false; m.visible = false;
  return m;
}
function bagua(k: Anlewo): Act | null {
  const disc = anchor(k, 'compass');
  if (!disc) return null;
  const { state, set } = base(k);
  const tri = (id: string) => { const t = TRIGRAMS.find((x) => x.id === id); const f = FALLBACK[id]; return { name: t?.name ?? f[0], image: t?.image ?? f[1], nature: t?.nature ?? f[2], lines: (t?.lines ?? f[3]) as [number, number, number] }; };
  const marks = ORDER.map((o) => { const t = tri(o.id), m = glyph(t.lines, t.name, t.image); k.world.scene.add(m); return m; });
  const shuo = yiWord('天地定位');
  let i = -1, t = 0;
  const c = disc.position;
  const face = (n: number) => {
    const o = ORDER[n], az = (o.az * Math.PI) / 180, fx = Math.sin(az), fz = Math.cos(az);
    k.player.faceTo = az;
    // 镜头在他身后偏高，越过他的肩看那一方
    k.nav.setPose({ pos: V(c.x - fx * 2.6 + fz * 0.55, c.y + 1.2, c.z - fz * 2.6 - fx * 0.55), look: V(c.x + fx * 40, c.y + 2.6, c.z + fz * 40), fov: 48, yaw: 16, up: 8, down: 8 }, 1.6);
    const m = marks[n], d = 300, el = 0.072;
    m.position.set(c.x + fx * d, c.y + d * el, c.z + fz * d); m.scale.setScalar(34);
    m.lookAt(k.world.camera.position.clone().setY(m.position.y));
    m.visible = true; (m.material as THREE.ShaderMaterial).uniforms.uA.value = 0;
    const tr = tri(o.id);
    set({ kind: 'bagua', title: `${tr.name}`, text: `${o.dir}　${tr.name}，${tr.image}，${tr.nature}。\n${o.scene}。`, count: n + 1, hint: '点画面，转向下一方', choices: [{ id: 'done', label: '罢' }] });
  };
  return {
    id: 'bagua', name: '八卦盘', anchor: c.clone().add(V(0, 1.3, 0)), spot: { x: c.x, z: c.z + 0.05, yaw: 0 }, radius: 1.8, state, noZoom: true,
    enter() {
      i = -1; t = 0;
      const av = k.player.av;
      av.setHands('sleeve'); av.lookAt(c);
      k.nav.setPose({ pos: V(c.x + 0.4, c.y + 2.05, c.z + 1.25), look: c.clone(), fov: 50, yaw: 10, up: 8, down: 6 }, 1.8);
      set({ kind: 'read', title: '先天八卦', text: shuo ? `「${shuo.text}」——${shuo.source}` : '天地定位，山泽通气，雷风相薄，水火不相射。', hint: '乾南坤北，离东坎西：这一片山水就是这么摆的', choices: [{ id: 'turn', label: '环视八方' }, { id: 'done', label: '罢' }] });
    },
    exit() { for (const m of marks) m.visible = false; k.player.av.lookAt(null); k.player.faceTo = null; },
    update(dt) {
      t += dt;
      for (let n = 0; n < marks.length; n++) {
        const u = (marks[n].material as THREE.ShaderMaterial).uniforms.uA;
        u.value += ((n === i ? 1 : 0) - u.value) * Math.min(1, dt * 1.6);
        if (u.value < 0.01 && n !== i) marks[n].visible = false;
      }
      if (i >= 0 && t > 6) advance();
    },
    input: { tap: () => { if (i >= 0 && t > 1.2) advance(); return true; } },
    cmd(cn) { if (cn === 'turn' && i < 0) advance(); else if (cn === 'done') k.exitAct(); },
  };
  function advance() {
    i++; t = 0;
    if (i < ORDER.length) { face(i); k.sfx('page', { vel: 0.25 }); return; }
    k.player.faceTo = 0;
    k.nav.setPose({ pos: V(c.x + 0.4, c.y + 2.05, c.z + 1.25), look: c.clone(), fov: 50, yaw: 10, up: 8, down: 6 }, 1.8);
    k.log({ kind: 'bagua' });
    set({ kind: 'read', title: '先天之序', lines: ['乾一　兑二　离三　震四', '巽五　坎六　艮七　坤八'], text: shuo ? `「${shuo.text}」` : undefined, source: shuo?.source, choices: [{ id: 'done', label: '毕' }] });
  }
}

export function create(k: Anlewo): Act[] {
  return [guan(k), nap(k), bagua(k)].filter((a): a is Act => !!a);
}
