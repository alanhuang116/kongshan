/**
 * 观星：晴夜，出柴门往东南几步，溪北那片草坡上铺一领席，坐下仰看。四周没有树、屋挡着，正南望过溪、田畴、伊水，天最空。
 *
 *   铺席、坐下，镜头从身后慢慢抬起来，停在仰看的地方：天占满画面，地上的树梢、远山的剪影留在下沿当衬。
 *   拖动 —— 看四方的天（抬头一直看到天顶）。
 *   点一颗星（或一段连线、一颗行星、月）—— 那个星官的连线一笔一笔描出来，旁边一个小楷的名字、一点朱砂；
 *            面板里是它属于哪一垣、哪一宿，一两句古书里的话（出处逐字核对过），和我们写的一两句白话。
 *   四象 —— 东方苍龙、北方玄武、西方白虎、南方朱雀，挑一象，七宿一宿一宿点亮（在地下的就说在地下）。
 *   候星移 —— 一夜的星在一会儿里转过去（斗转星移），转完再回来。
 *   偶尔有流星划过；流星雨那几夜多些。
 *
 * 星官的连线平时不显，只有观星的时候才描出来（淡淡一层，点着的那一个重些）。这里也把天接上总装：画质档、第几日。
 * 点着一处说它是什么，与平时夜里在外面点天共用 acts/skyinfo.ts。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { box, cyl } from '../core/geo';
import { PIG, wash } from '../ink/ink';
import { groundAt } from '../walk';
import { D2R, PLANETS } from '../env/stars/astro';
import { cnNum, XIANG, type Asterism } from '../env/stars/catalog';
import type { Picked } from '../env/sky';
import { HAN, XIANG_NOTE } from '../../data/starlore';
import { PAIRS, sitDown } from './lib';
import { asterismCard, fmtAlt, galactic, hanCard, moonCard, noteSeen, planetCard, smallCard, type StarBook } from './skyinfo';
import type { Act } from './types';

export type { StarBook } from './skyinfo';

/** 席铺在哪：院门外东南，村路与溪之间的草坡（离路两三米、离溪岸两三米；不在田里，不挡别人的东西） */
export const STAR_SPOT = { x: 8, z: 25.6 };
/** 平时观星时所有连线淡到几成（点着的那一个由 skyinfo 描到 0.85） */
const ALL_A = 0.075;
const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const wrapA = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** 一领草席：卷着放、铺开、收起 */
function makeMat() {
  const g = new THREE.Group(), L = 1.85, W = 0.92;
  const straw = wash({ pig: PIG.mao, dens: 0.72, shade: 1.25, grain: 1.6, streak: [0, 34, 0.38], line: 0.55, snow: 0 });
  const edge = wash({ pig: PIG.zhe, dens: 1.25, shade: 1.3, grain: 1.2, line: 0.6, snow: 0 });
  // 席面（以北头为轴，往南铺开：z 从 0 到 L）
  const sheet = new THREE.Mesh(box(W, 0.012, L).translate(0, 0.006, L / 2), straw);
  // 两边包的布边
  const b1 = new THREE.Mesh(box(0.035, 0.016, L).translate(-W / 2 + 0.017, 0.008, L / 2), edge);
  const b2 = new THREE.Mesh(box(0.035, 0.016, L).translate(W / 2 - 0.017, 0.008, L / 2), edge);
  const flat = new THREE.Group(); flat.add(sheet, b1, b2);
  // 还卷着的那一卷
  const roll = new THREE.Mesh(cyl(1, 1, W, 18).rotateZ(Math.PI / 2), straw);
  g.add(flat, roll);
  return {
    group: g,
    /** k：0 卷着，1 铺平 */
    set(k: number) {
      const s = Math.max(0.02, k), r = 0.075 * Math.sqrt(1 - k) + 0.004;
      flat.scale.set(1, 1, s);
      roll.scale.setScalar(1); roll.scale.set(1, r, r);
      roll.position.set(0, r, L * s);
      roll.visible = k < 0.995;
    },
    L,
  };
}

export function create(k: Anlewo): Act | null {
  const sky = k.atmos.sky;
  // 把天接上总装：画质档决定画多少颗星；第几日让日子往后推
  sky.setQuality(k.q.tier);
  sky.dayFn = () => k.day;

  const gy = groundAt(STAR_SPOT.x, STAR_SPOT.z) ?? groundAt(STAR_SPOT.x, STAR_SPOT.z + 0.5) ?? 6.3;
  const mat = makeMat();
  // 席的北头在人脚边，往南铺开；人坐在席的北半截，面朝南
  const matZ0 = STAR_SPOT.z - 0.45;
  mat.group.position.set(STAR_SPOT.x, gy + 0.004, matZ0);
  mat.group.visible = false; mat.set(0);
  k.world.scene.add(mat.group);
  const seat = new THREE.Object3D();
  seat.position.set(STAR_SPOT.x, gy + 0.018, matZ0 + 0.85); seat.rotation.y = 0;

  // —— 状态 ——
  let phase: 'idle' | 'lay' | 'look' | 'menu' | 'tour' | 'shift' = 'idle';
  let t = 0, camK = 0, matK = 0, matGoal = 0, linesOn = true, shiftBack = 0;
  const gaze = { yaw: 0.4, pitch: 0.7, y: 0.4, p: 0.7 };
  let sel: Picked | null = null, moonSel = false;
  let tour: { x: number; i: number; t: number } | null = null;
  let shiftT = 0, metSeen = false;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  /**
   * 头在哪（镜头从这里仰看）：盘腿坐着时在席的北半截、离地 0.95 米；仰卧（lying，见「铺席、坐下」那一句）时在席的北头、贴着席面。
   * 仰卧时开场的镜头也抬高一些、先往下看着他躺下。
   */
  let lying = false;
  const head = () => (lying ? tmp.set(STAR_SPOT.x, gy + 0.23, matZ0 + 0.27) : tmp.set(STAR_SPOT.x, gy + 0.95, matZ0 + 0.85));
  /** 开场镜头起先的俯仰：坐着时平看过去；仰卧时先往下看着他躺在席上 */
  const P0 = () => (lying ? -0.32 : 0.12);
  const dirOf = (yaw: number, pitch: number, out = new THREE.Vector3()) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const aimAt = (w: THREE.Vector3, maxPitch = 1.2) => {
    gaze.yaw = Math.atan2(w.x, w.z);
    gaze.pitch = Math.max(0.42, Math.min(maxPitch, Math.asin(Math.max(-1, Math.min(1, w.y)))));
  };
  // 手机上面板一行一枚，少放几枚，天才露得出来（连线的显隐留着 cmd('lines')，不上面板）
  const choices = () => [{ id: 'xiang', label: '四象' }, { id: 'shift', label: '候星移' }, { id: 'done', label: '起身' }];
  const hintNow = () => {
    const sh = sky.shower();
    return sh && sh.k > 0.3 ? `这几夜流星多，像是从${sh.near}一带射出来的。拖动看四方，点一颗星` : '拖动看四方的天；点一颗星，看它是哪一官';
  };
  const showLines = () => { sky.lines.setAll(linesOn ? ALL_A : 0, 0.8); };
  /** 观星录（k.mem 'stars'）：认得了哪些星官、哪几颗行星，看过哪几象，看了几夜、见了几颗流星 */
  const book = () => k.mem.get<StarBook>('stars', { seen: [], planets: [], xiang: [], nights: 0, meteors: 0 });
  /** 记一笔；头一回认得的，返回它是第几个 */
  const note1 = (key: 'seen' | 'planets' | 'xiang', name: string): number => noteSeen(k, key, name);

  // —— 点着了什么 ——
  function clearSel() {
    sel = null; moonSel = false;
    sky.stars.highlight(null);
    for (let i = 0; i < PLANETS.length; i++) sky.stars.highlightPlanet(i, 0);
    sky.labels.hideAll('sel'); sky.labels.hideAll('star'); sky.labels.hideAll('han-');
    showLines();
  }
  function lookMenu() {
    phase = 'look';
    if (!sel) showLines();
    set({ kind: 'stars', title: '观星', hint: hintNow(), choices: choices() });
  }
  // 点着的那一处：天上点亮、面板里说它（话由 skyinfo 拼）
  function showAsterism(a: Asterism, star: number | null) {
    const c = asterismCard(k, a, star, linesOn ? ALL_A : 0);
    set({ kind: 'stars', title: c.title, hint: c.hint, text: c.text, source: c.source, gloss: c.gloss });
  }
  function showPlanet(i: number) {
    const c = planetCard(k, i, linesOn ? ALL_A : 0);
    set({ kind: 'stars', title: c.title, hint: c.hint, text: c.text, source: c.source, gloss: c.gloss });
  }
  function showMoon() {
    moonSel = true;
    clearSelVisualOnly();
    const c = moonCard(k);
    set({ kind: 'stars', title: c.title, hint: c.hint, lines: c.lines, source: c.source, gloss: c.gloss });
  }
  function clearSelVisualOnly() {
    sel = null;
    sky.stars.highlight(null);
    for (let i = 0; i < PLANETS.length; i++) sky.stars.highlightPlanet(i, 0);
    sky.labels.hideAll('sel'); sky.labels.hideAll('star'); sky.labels.hideAll('han-');
    showLines();
  }

  // —— 四象 ——
  function startTour(x: number) {
    phase = 'tour'; tour = { x, i: -1, t: 9 };
    clearSelVisualOnly();
    sky.lines.setAll(linesOn ? ALL_A * 0.6 : 0, 1);
    sky.labels.hideAll('xiu');
  }
  function tourStep() {
    if (!tour) return;
    const X = XIANG[tour.x];
    tour.i++; tour.t = 0;
    if (tour.i >= 7) { endTour(); return; }
    const r = X.from + tour.i, a = sky.data.find(sky.data.regions[r]);
    if (!a) { tourStep(); return; }
    const w = sky.toWorld(a.center, tmp2), up = w.y > 0.05;
    sky.lines.set(a.i, up ? 0.9 : 0.25, 2.2, true);
    if (up) { sky.labels.show(`xiu${tour.i}`, a.name, a.center, { alpha: 0.95 }); aimAt(w, 1.15); }
    k.sfx('starLight', { vel: 0.3 + tour.i * 0.05, pitch: tour.i });
    set({ kind: 'stars', title: X.name, count: tour.i + 1, total: 7, hint: up ? `${a.name}，${fmtAlt(w)}` : `${a.name}，此刻在地平之下，看不见`, choices: [{ id: 'skip', label: '下一宿' }, { id: 'back', label: '罢' }] });
  }
  function endTour() {
    if (!tour) return;
    const X = XIANG[tour.x], info = XIANG_NOTE[X.id];
    let upN = 0; for (let i = 0; i < 7; i++) { const a = sky.data.find(sky.data.regions[X.from + i]); if (a && sky.toWorld(a.center, tmp2).y > 0.05) upN++; }
    const seen = upN === 7 ? '七宿此刻都在天上。' : upN === 0 ? '七宿此刻都在地平之下。' : `七宿此刻有${cnNum(upN)}宿在天上。`;
    const q = info.quotes;
    k.log({ kind: 'stars', text: X.name });
    note1('xiang', X.id);
    phase = 'menu';
    set({ kind: 'stars', title: X.name, text: q.map((x) => x.text).join('\n'), source: q.map((x) => x.source.replace(/^《|》$/g, '')).join('；'), gloss: `${info.note}${seen}`, choices: [...XIANG.filter((_, i) => i !== tour!.x).map((x) => ({ id: 'x:' + x.id, label: x.short })), { id: 'back', label: '罢' }] });
    tour = null;
  }

  // —— 候星移 ——
  function startShift() {
    phase = 'shift'; shiftT = 0;
    clearSelVisualOnly();
    const d = sky.data.find('北斗'); if (d) sky.lines.set(d.i, 0.7, 1.5, true);
    // 朝北看：众星绕着北极转
    gaze.yaw = Math.PI; gaze.pitch = 0.78;
    k.world.fpsCap = 0;
    set({ kind: 'stars', title: '候星移', hint: '一个时辰一个时辰地过去：众星绕着北极转', progress: 0, quiet: true });
  }

  const act: Act & { on(): boolean } = {
    id: 'stars', name: '观星',
    anchor: new THREE.Vector3(STAR_SPOT.x, gy + 1.1, STAR_SPOT.z), spot: { x: STAR_SPOT.x, z: matZ0 - 0.25, yaw: 0 }, radius: 2.6,
    state, noZoom: true,
    // 晴夜才有：夜深了（不是黄昏刚暗）、没有雨雪雾
    on: () => { const a = k.atmos; return a.night > 0.6 && a.w.rain + a.w.snow + a.w.mist < 0.4; },
    enter() {
      phase = 'lay'; t = 0; camK = 0; matK = 0; matGoal = 1; tour = null; sel = null; moonSel = false;
      mat.group.visible = true; mat.set(0);
      const av = k.player.av;
      av.setHands('free');
      k.sfx('matUnroll', { vel: 0.5, x: STAR_SPOT.x, z: STAR_SPOT.z });
      // 先看哪里：此刻天上最好认的那一片，偏南的优先（南边最空，银河也多在那边）
      const pick = ['河鼓', '织女', '参宿', '心宿', '轩辕', '天津', '昴宿', '北斗', '室宿', '角宿', '毕宿', '大角'];
      let aim: THREE.Vector3 | null = null, best = -9;
      pick.forEach((n, i) => { const a = sky.data.find(n); if (!a) return; const w = sky.toWorld(a.center); if (w.y < Math.sin(26 * D2R) || w.y > Math.sin(70 * D2R)) return; const sc = w.z / Math.hypot(w.x, w.z) - i * 0.04; if (sc > best) { best = sc; aim = w; } });
      if (aim) aimAt(aim, 0.82); else { gaze.yaw = 0.35; gaze.pitch = 0.75; }
      // 镜头先在他身后（北边）高处往下看着他铺席、坐下、躺平，再转过去、抬起来（躺着看天：镜头一开始就照着躺下后的头位）
      lying = true;
      gaze.y = 0; gaze.p = P0();
      sky.meteorRate = 1 / 16;
      k.mem.patch('stars', { nights: (book().nights ?? 0) + 1 });
      // 观星时整个夜更静（声音那一路按 focus 压低风声、虫声）
      k.focus = 'stars';
      set({ kind: 'stars', title: '观星', hint: '铺一领席，坐下来看天', quiet: true });
    },
    exit() {
      phase = 'idle'; matGoal = 0; tour = null;
      clearSelVisualOnly();
      sky.lines.setAll(0, 1.4);
      sky.labels.hideAll();
      sky.meteorRate = 1 / 140;
      k.sfx('matRoll', { vel: 0.45, x: STAR_SPOT.x, z: STAR_SPOT.z });
      shiftBack = k.atmos.starShift;
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null);
      k.world.fpsCap = 0;
      // 起身、Esc 中途作罢都走这里：夜的声音还原
      if (k.focus === 'stars') k.focus = null;
      lying = false;
    },
    update(dt) {
      t += dt;
      const av = k.player.av;
      // 铺席、坐下
      if (phase === 'lay') {
        if (t > 1.15 && t - dt <= 1.15) sitDown(k, seat, { ground: gy, dur: 1.3 });
        // 坐定了往后一靠，两手撑一下，躺平在席上（头枕右手、左手搭在腹上）
        if (t > 2.5 && t - dt <= 2.5) av.setPose('lie', 1.6);
        if (t > 4.2) { phase = 'look'; lookMenu(); }
      }
      // 镜头：先在身后看着他坐下、躺下，再慢慢抬起来，停在仰看的地方
      if (phase !== 'lay' || t > 2.8) camK = Math.min(1, camK + dt / 3.2);
      const yGoal = camK < 1 ? wrapA(gaze.yaw) * ease(camK) : gaze.yaw;
      gaze.y += wrapA(yGoal - gaze.y) * Math.min(1, dt * (phase === 'tour' ? 1.6 : camK < 1 ? 3 : 5));
      const pGoal = camK < 1 ? P0() + (gaze.pitch - P0()) * ease(camK) : gaze.pitch;
      gaze.p += (pGoal - gaze.p) * Math.min(1, dt * (camK < 1 ? 3 : 5));
      const H = head(), e = ease(camK);
      const back = dirOf(gaze.y, 0), open = tmp2.set(H.x - back.x * 2.6 + 0.5, H.y + (lying ? 1.5 : 0.75), H.z - back.z * 2.6);
      const eye = new THREE.Vector3(H.x - back.x * 0.28, H.y + 0.22, H.z - back.z * 0.28);
      const pos = open.lerp(eye, e);
      const look = pos.clone().addScaledVector(dirOf(gaze.y, gaze.p), 60);
      k.nav.setPose({ pos, look, fov: 60 + 14 * e, yaw: 0, up: 0, down: 0 }, 0.0001);
      // 镜头贴到眼前时就不画人了（从他眼里看出去）
      k.player.setVisible(e < 0.85);
      if (phase !== 'lay') av.lookAt(H.clone().addScaledVector(dirOf(gaze.y, Math.min(gaze.p, 0.9)), 20));
      // 四象：一宿一宿点亮
      if (phase === 'tour' && tour) { tour.t += dt; if (tour.t > 2.2) tourStep(); }
      // 候星移：六个时辰在十二秒里转过去，停一会儿，再说一句
      if (phase === 'shift') {
        shiftT += dt;
        const u = Math.min(1, shiftT / 12);
        k.atmos.starShift = 6 * ease(u);
        state.progress = u; if (Math.floor(shiftT * 4) !== Math.floor((shiftT - dt) * 4)) k.emitAct();
        if (shiftT > 13.5) {
          phase = 'menu';
          const pair = PAIRS.find((p) => p.id === 'c07') ?? PAIRS.find((p) => p.id === 'c08');
          const s = pair ? null : { text: '斗转星移。', source: '' };
          set({ kind: 'stars', title: '候星移', text: pair ? `${pair.a}，${pair.b}。` : s!.text, source: pair ? `邵雍《${pair.from}》` : undefined, gloss: '六个时辰过去，北斗绕着北极转了半圈；东边又升起了别的星。', choices: [{ id: 'unshift', label: '回到此刻' }, { id: 'done', label: '起身' }] });
          k.log({ kind: 'stars', text: '候星移' });
        }
      }
    },
    input: {
      move(p) {
        if (phase === 'lay') return true;
        const H = k.world.size.y || 700, kk = (k.world.camera.fov * D2R) / H;
        gaze.yaw = wrapA(gaze.yaw + p.dx * kk); gaze.pitch = Math.max(0.06, Math.min(1.5, gaze.pitch + p.dy * kk));
        if (phase === 'tour' && tour) tour.t = Math.min(tour.t, 0.5);
        return true;
      },
      tap(p) {
        if (phase === 'lay' || phase === 'shift') return true;
        if (phase === 'tour') { if (tour && tour.t > 0.6) tourStep(); return true; }
        const ray = k.world.ray(p.nx, p.ny).ray.direction, H = k.world.size.y || 700;
        const tol = (24 * k.world.camera.fov * D2R) / H;
        // 月：点在月轮上
        const m = sky.moonDraw;
        if (m.y > 0.02 && ray.angleTo(m) < 0.05 && k.atmos.night > 0.5) { showMoon(); return true; }
        const pk = sky.pick(ray.clone(), tol, { lines: linesOn });
        if (!pk) {
          // 点在天汉上：说天汉（这一段在哪、两岸的牵牛织女）
          const g = galactic(k, ray);
          if (g.bright > 0.16) {
            clearSelVisualOnly(); moonSel = false;
            const c = hanCard(k, ray, g.l, g.b);
            set({ kind: 'stars', title: c.title, hint: c.hint, text: c.text, source: c.source, gloss: c.gloss });
            return true;
          }
          if (sel || moonSel) { clearSel(); lookMenu(); }
          return true;
        }
        sel = pk; moonSel = false;
        if (pk.kind === 'planet') showPlanet(pk.planet);
        else if (pk.kind === 'line') showAsterism(sky.data.asterisms[pk.asterism], null);
        else if (pk.asterism != null) showAsterism(sky.data.asterisms[pk.asterism], pk.star);
        else {
          // 不在哪个星官里的小星
          clearSelVisualOnly();
          const c = smallCard(k, pk.star);
          set({ kind: 'stars', title: c.title, hint: c.hint, text: c.text, source: c.source });
        }
        return true;
      },
    },
    cmd(c) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'lines') { linesOn = !linesOn; if (sel?.kind === 'star' && sel.asterism != null) showAsterism(sky.data.asterisms[sel.asterism], sel.star); else { showLines(); lookMenu(); } return; }
      if (c === 'xiang') { clearSelVisualOnly(); phase = 'menu'; set({ kind: 'stars', title: '四象', hint: '二十八宿分作四方，每方七宿', text: HAN[0].text, source: HAN[0].source, choices: [...XIANG.map((x) => ({ id: 'x:' + x.id, label: x.short })), { id: 'back', label: '罢' }] }); return; }
      if (c.startsWith('x:')) { const i = XIANG.findIndex((x) => 'x:' + x.id === c); if (i >= 0) startTour(i); return; }
      if (c === 'skip') { tourStep(); return; }
      if (c === 'back') { tour = null; sky.labels.hideAll('xiu'); clearSelVisualOnly(); lookMenu(); return; }
      if (c === 'shift') { startShift(); return; }
      if (c === 'unshift') { shiftBack = k.atmos.starShift; const d = sky.data.find('北斗'); if (d) sky.lines.set(d.i, linesOn ? ALL_A : 0, 1); lookMenu(); return; }
    },
  };

  // 流星划过时一缕极轻的嘶声：观星时一定出（并记进观星录，这一回头一颗时轻轻说一句）；平时漫游只在晴夜、屋外
  sky.onMeteor = () => {
    if (k.act === act) {
      k.sfx('meteor', { vel: 0.5 });
      k.mem.patch('stars', { meteors: (book().meteors ?? 0) + 1 });
      if (!metSeen && phase !== 'lay') { metSeen = true; k.note('一颗流星划过', 'stars'); }
      return;
    }
    const a = k.atmos;
    if (a.night > 0.6 && a.w.rain + a.w.snow + a.w.mist < 0.4 && k.nav.place.indoor < 0.5) k.sfx('meteor', { vel: 0.3 });
  };

  // 席的铺开、收起，候星移转回来：做完这件事以后还要动一会儿，挂在每帧里（没事时立刻返回）
  k.world.tick.push((dt) => {
    if (matK !== matGoal) {
      matK = matGoal > matK ? Math.min(matGoal, matK + dt / 1.0) : Math.max(matGoal, matK - dt / 0.8);
      mat.set(ease(matK));
      if (matK === 0 && matGoal === 0) mat.group.visible = false;
    }
    if (shiftBack > 0 && phase !== 'shift') {
      shiftBack = Math.max(0, shiftBack - dt * 6);
      k.atmos.starShift = shiftBack;
    }
  });
  return act;
}
