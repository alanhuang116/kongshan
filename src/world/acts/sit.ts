/**
 * 打坐：溪边那株卧柳东边，一块顶上平的大石，石上一只蒲团。面朝南，前头是溪、田畴、伊水与远山；
 * 背后是缓坡、草堂与邙山——北天空着，看得见北斗（观物亭的坡上，北面是竹，北极常被遮住，所以不放在那里）。
 *
 *   坐上去，两手叠在腹前。不动，便渐渐入静：先调息几秒，再一境一境地深下去（play/study/vision.ts）——
 *   一时、一夜、一月、一岁、入定，修为到了哪一重，就能深到哪一境（play/xiuwei.ts）。
 *   动一动（点画面、拖、按键、推摇杆）就慢慢出来；静下来，又从头深下去。
 *   起身时说一句坐了多久、到了哪一境，修为长了几分；打坐榜记最深的一回（到了第几境、在那一境里坐了多久）。
 * 别人那边看见你盘腿坐在石上（事的名字是 sit，单子上叫「打坐」）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import type { Season } from '../env/atmos';
import { lathe } from '../core/geo';
import { PIG, wash } from '../ink/ink';
import { flatRock } from '../build/kit';
import { addDisc, groundAt } from '../walk';
import { SITE, ground } from '../site';
import { sitDown } from './lib';
import { SitVision } from '../play/sit';
import { TIERS, fmtSit, minutes, sitScore, tierCap } from '../play/study/vision';
import { LEVELS, addXiu, noteTier, startXiu, xiuOf } from '../play/xiuwei';
import { registerBoard, report } from '../play/board';
import { SAYINGS } from '../../data/shaoyong';
import { YI_WORDS } from '../../data/yi';
import { cn } from '../../util/cn';

/** 石在哪：溪北岸，卧柳（11, 58.4）东边五六步，离水边四五米；不在路上，村里人也不从这里过 */
export const SIT_AT = { x: 16.6, z: 56.4 };
/** 石顶、蒲团的高（离地） */
const ROCK_H = 0.2, ZAFU_H = 0.13;

registerBoard({
  key: 'sit', name: '打坐', order: 2, fmt: fmtSit,
  // 村里人：行脚僧最能坐；邵先生的读书朋友、药农、塾师；孩子坐不住
  folk: [['了然', sitScore(4, 300)], ['郑先生', sitScore(3, 90)], ['孟老', sitScore(2, 60)], ['赵先生', sitScore(1, 120)], ['石头', sitScore(0, 30)]],
  note: '溪边石上静坐：记最深的一回——到了第几境、在那一境里坐了多久',
});

function makeProps(k: Anlewo, gy: number) {
  const g = new THREE.Group();
  g.name = 'sit:rock';
  const stone = wash({ pig: PIG.mo, dens: 0.6, shade: 1.9, cun: 0.8, grain: 1.2 });
  const straw = wash({ pig: PIG.mao, dens: 0.8, shade: 1.35, grain: 1.6, streak: [0, 34, 0.32], line: 0.6, snow: 0.4 });
  // 一块大半埋在土里的平顶石：顶面一米来宽
  const rock = new THREE.Mesh(flatRock(4511, 0.66, ROCK_H, 0.56, k.q.tier === 'low' ? 1 : 2, 0.82), stone);
  rock.position.set(SIT_AT.x, gy - 0.04, SIT_AT.z); rock.rotation.y = 0.35;
  // 蒲团：草编的一只圆垫，边上鼓、顶上微凹
  const zafu = new THREE.Mesh(lathe([[0.001, 0], [0.27, 0], [0.305, 0.03], [0.315, 0.07], [0.3, 0.11], [0.25, ZAFU_H], [0.12, ZAFU_H - 0.008], [0.001, ZAFU_H - 0.01]], 22), straw);
  zafu.position.set(SIT_AT.x, gy - 0.04 + ROCK_H, SIT_AT.z);
  g.add(rock, zafu);
  k.world.scene.add(g);
  // 石头挡路（人绕着走；坐上去时身子是送过去的）
  addDisc(SIT_AT.x, SIT_AT.z, 0.62);
  return { group: g, top: gy - 0.04 + ROCK_H + ZAFU_H - 0.012 };
}

export function create(k: Anlewo): Act | null {
  startXiu(k);
  const gy = groundAt(SIT_AT.x, SIT_AT.z) ?? ground(SIT_AT.x, SIT_AT.z);
  const { top } = makeProps(k, gy);
  const seat = new THREE.Object3D();
  seat.position.set(SIT_AT.x, top, SIT_AT.z); seat.rotation.y = 0;
  const S = new THREE.Vector3(SIT_AT.x, top, SIT_AT.z);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(S.x + x, S.y + y, S.z + z);
  /** 园里某处的一点（地面以上 h 米） */
  const at = (x: number, z: number, h: number) => new THREE.Vector3(x, (groundAt(x, z) ?? ground(x, z)) + h, z);
  /** 各境的机位（−1 是坐着时的那一个：左后方越过肩头看溪） */
  const cam = (i: number, s?: Season) => {
    // 一岁：四季各看园里一处——春天从石边往西看溪边的桃，夏天门前塘的荷，秋天院里的菊圃，冬天雪里的老梅
    const PD = SITE.pond;
    // 夏：池北岸叠石上俯看满池的荷（东岸平视，柳干、芦苇横在当中）
    if (i === 3 && s === 'summer') return { pos: new THREE.Vector3(PD.x + 2.7, PD.y + 3.9, PD.z - 10.5), look: new THREE.Vector3(PD.x - 0.6, PD.y - 0.3, PD.z + 0.8), fov: 54 };
    if (i === 3 && s === 'autumn') return { pos: at(-1.6, 14.8, 1.5), look: at(-6.6, 9.6, 0.2), fov: 48 };
    if (i === 3 && s === 'winter') return { pos: at(4.4, 16.6, 1.6), look: at(9.6, 12.8, 1.5), fov: 50 };
    if (i === 0) return { pos: V(-0.9, 1.45, -3.6), look: V(0, 6, 60), fov: 50 };
    // 一夜：北天要整个装下北斗绕北极的那一圈（北极高三十四度六，北斗离它三四十度）：镜头放低、放宽，柳在左边
    if (i === 1) return { pos: V(1.3, 0.8, 3.5), look: V(1.3, 0.8, 3.5).add(new THREE.Vector3(0, Math.tan(0.66) * 40, -40)), fov: 74 };
    // 一月：月从上弦到残月都在南、东南天上，柳在西边，镜头偏东一点看过去
    if (i === 2) return { pos: V(1.2, 1.25, -3.2), look: V(8, 22, 40), fov: 62 };
    // 一岁：从东北往西看溪：柳、石桥、溪边的桃；坐着的人整个落在左下角
    if (i === 3) return { pos: V(3.4, 1.9, -3.4), look: V(-30, -0.5, 9), fov: 52 };
    // 入定：北天，连黄极（高五十八度）、北极与勾陈一走的那一圈都装下
    if (i === 4) return { pos: V(1.1, 0.7, 3.2), look: V(1.1, 0.7, 3.2).add(new THREE.Vector3(0, Math.tan(0.77) * 40, -40)), fov: 74 };
    return { pos: V(1.5, 1.05, -2.9), look: V(-0.4, 0.15, 4.5), fov: 46 };
  };
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  let stir = false, hintT = 0, mins = 0, gained = 0, phase: 'sit' | 'end' = 'sit', lastTier = -2;
  const vision = new SitVision(k, cam, {
    tier: (i) => { if (noteTier(k, i)) gained += addXiu(k, 'tier', 3); },
    rise: () => { show('动了一下，慢慢出来了。再静下来，又从头深下去'); },
  });
  const capNow = () => tierCap(xiuOf(k).level.i);
  // 给调试与自动测试看（静了几秒、在哪一境）
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__sit = vision;
  /** 面板：只有题名、此刻在哪一境、右下的「起身」；一句提示出几秒就收 */
  function show(hint?: string) {
    const i = vision.tier;
    if (hint !== undefined) hintT = 5.5;
    set({ kind: 'rest', title: '打坐', count: i >= 0 ? TIERS[i].name : '', hint: hintT > 0 ? hint ?? (state.hint as string | undefined) : undefined, choices: [{ id: 'done', label: '起身' }] });
  }
  /** 起身前那一页：坐了多久、到了哪一境、修为长了几分，配一句古人的话 */
  function summary() {
    phase = 'end';
    const deep = vision.deepest, xi = xiuOf(k);
    const said = deep >= 4 && xi.level.i >= 5 ? YI_WORDS.find((w) => w.id === 'w25') : null;
    const s11 = SAYINGS.find((s) => s.id === 's11');
    const head = `静坐${minutes(vision.still) || '片刻'}${deep >= 0 ? `，到了「${TIERS[deep].name}」` : ''}。${gained ? `修为长了${cn(gained)}分。` : ''}`;
    const deepNote = deep >= 4 && vision.nearName ? `一会之后，近北极的是${vision.nearName}。` : '';
    if (said) set({ kind: 'read', title: '打坐', text: `${head}${deepNote}\n「${said.text}」`, source: said.source, choices: [{ id: 'bye', label: '起身' }] });
    else set({ kind: 'read', title: '打坐', text: `${head}${deepNote}${s11 ? `\n「${s11.text}」` : ''}`, source: s11?.source, gloss: s11?.gloss, choices: [{ id: 'bye', label: '起身' }] });
    vision.end();
    k.nav.setPose({ ...cam(-1), yaw: 14, up: 8, down: 8 }, 1.4);
  }
  function finish() {
    if (vision.deepest >= 0) report(k, 'sit', sitScore(vision.deepest, vision.deepSec));
  }

  const act: Act = {
    id: 'sit', name: '打坐',
    anchor: V(0, 1.0, 0.1),
    spot: { x: SIT_AT.x, z: SIT_AT.z - 0.95, yaw: 0 },
    radius: 2.4, state, noZoom: true,
    enter() {
      stir = false; mins = 0; gained = 0; phase = 'sit'; lastTier = -2;
      const av = k.player.av;
      sitDown(k, seat, { ground: k.player.pos.y, mat: { h: top - k.player.pos.y, r: 0.3 }, dur: 1.5 });
      av.setHands('lap', 0.8); av.lookAt(null);
      k.nav.setPose({ ...cam(-1), yaw: 14, up: 8, down: 8 }, 1.8);
      vision.begin(capNow());
      show('不动，便渐渐入静；动一动、点一下，就慢慢出来');
    },
    exit() {
      try { if (phase === 'sit') finish(); } finally { vision.end(); }
      k.player.av.bow = 0;
    },
    update(dt) {
      if (phase !== 'sit') return;
      try {
        const still = !stir && k.keyMove.lengthSq() < 1e-4 && k.stick.lengthSq() < 1e-4;
        stir = false;
        vision.step(dt, still);
        // 一分钟一分：静着的工夫（出定了也接着算）
        const m = Math.floor(vision.still / 60);
        if (m > mins) { const n = m - mins; mins = m; if (mins <= 5) gained += addXiu(k, 'sit', n); }
        // 静得深了，头微微垂下来
        k.player.av.bow = vision.deep ? 0.06 + 0.04 * Math.min(1, vision.depth / 60) : 0.02;
        if (hintT > 0) { hintT -= dt; if (hintT <= 0) show(); }
        if (vision.tier !== lastTier) {
          const was = lastTier;
          lastTier = vision.tier;
          if (vision.tier >= 0) show(TIERS[vision.tier].note);
          else if (was >= 0) show();
          // 到了够得着的最深一境：说一声再往深处要等修为
          if (vision.tier >= 0 && vision.tier === vision.cap && vision.cap < TIERS.length - 1) window.setTimeout(() => { if (k.act === act && phase === 'sit' && vision.tier === vision.cap) show(`再往深处，要等修为到了「${nextLevelName(vision.cap)}」`); }, 9000);
        }
      } catch (e) {
        // 出了错：天象先收回来，再起身
        console.warn('打坐出错', e);
        vision.end();
        k.exitAct();
      }
    },
    input: {
      down: () => { stir = true; },
      move: () => { stir = true; return true; },
      tap: () => { stir = true; return true; },
    },
    cmd(c) {
      if (c === 'done' && phase === 'sit') { finish(); summary(); }
      else if (c === 'bye' || c === 'done') k.exitAct();
    },
  };
  return act;
}

/** 第 cap 境之后那一境要修为到哪一重（xiuwei 的名字） */
const nextLevelName = (cap: number) => LEVELS[Math.min(LEVELS.length - 1, TIERS[Math.min(TIERS.length - 1, cap + 1)].need)].name;
