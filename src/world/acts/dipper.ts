/**
 * 认北斗（「遇童子便教认北斗」）。
 * 夜里、天清的时候，在溪桥南头朝北站定：先把勺子的七颗星一颗颗点出来（各显其名），七颗齐了，勺子一笔一笔描出来；
 * 再由斗口两星——天璇到天枢——连线向前延长五倍（一道走动的虚线指过去），找到北极星；末了看一看此刻斗柄指着哪一方。
 * 星是星表里的真星，按洛阳的纬度、画里的日子与时辰摆（env/sky.ts），所以春天黄昏斗柄朝东，夏天朝南，一年转一圈。
 * 名字、连线都画在天上（env/stars/layers.ts：小楷的名、一点朱砂，月白的淡描），与观星是同一套。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { D2R, LAT } from '../env/stars/astro';
import { SITE } from '../site';
import { groundAt } from '../walk';
import type { Act } from './types';

const NAMES = ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光', '北极星'];
const DATA = import.meta.glob<Record<string, unknown>>('../../data/almanac.ts', { eager: true });
const DIPPER = Object.values(DATA).map((m) => m.DIPPER as { quote?: { text: string; source: string } } | undefined).find(Boolean);
const QUOTE = DIPPER?.quote ?? { text: '斗柄东指，天下皆春；斗柄南指，天下皆夏；斗柄西指，天下皆秋；斗柄北指，天下皆冬。', source: '《鹖冠子·环流》' };

/**
 * 此刻斗柄指着哪一方：面朝北看，从北天极到斗柄末梢（摇光）——横着偏多是东西，竖着偏多是南（朝上）北。
 * （与 tests/stars.test.ts 里核对「春东、夏南、秋西、冬北」用的是同一个判法）
 */
export function handleDir(tip: THREE.Vector3): string {
  const h = [tip.x, tip.y - Math.sin(LAT * D2R), tip.z + Math.cos(LAT * D2R)];
  return Math.abs(h[0]) > Math.abs(h[1]) ? (h[0] > 0 ? '东' : '西') : h[1] > 0 ? '南' : '北';
}

export function create(k: Anlewo): Act {
  const sx = SITE.bridge.x + 1.3, sz = SITE.bridge.z + SITE.bridge.len / 2 + 1.4, gy = groundAt(sx, sz) ?? 6;
  const sky = k.atmos.sky;
  const found = new Array<boolean>(8).fill(false);
  let step = 0;
  const hand = new THREE.Vector3();
  const eqOf = (i: number): [number, number, number] => { const s = sky.data.dipper[i], S = sky.data.stars.dir; return [S[s * 3], S[s * 3 + 1], S[s * 3 + 2]]; };
  const dipperA = () => sky.data.find('北斗');
  const handle = () => handleDir(sky.star(6));
  const emit = () => {
    const n = found.slice(0, 7).filter(Boolean).length;
    act.state = step === 0 ? { kind: 'dipper', title: '认北斗', hint: `先找勺子：七颗亮星，一颗一颗点出来（${n} / 7）`, count: n, total: 7 }
      : step === 1 ? { kind: 'dipper', title: '认北斗', hint: '斗口两星——天璇到天枢——连起来，往前延长五倍，那里是北极星。点一点它' }
        : { kind: 'dipper', title: '认北斗', text: `此刻斗柄指${handle()}。\n${QUOTE.text}`, source: QUOTE.source, choices: [{ id: 'done', label: '毕' }], done: true };
    k.emitAct();
  };
  const label = (i: number) => sky.labels.show(`dip${i}`, NAMES[i], eqOf(i), { big: i === 7, side: i === 7 ? 'right' : 'right' });
  const act: Act & { on(): boolean } = {
    id: 'dipper', name: '认北斗',
    anchor: new THREE.Vector3(sx, gy + 2.0, sz - 0.6), spot: { x: sx, z: sz, yaw: Math.PI }, radius: 3,
    state: {},
    on: () => { const w = k.atmos; return w.night > 0.6 && w.w.rain + w.w.snow + w.w.mist < 0.4; },
    enter() {
      found.fill(false); step = 0;
      const av = k.player.av;
      av.setHands('free');
      // 机位：退到他身后低处，仰着看北天——人在画面底下指着，勺子与北极星在上半幅
      const c = new THREE.Vector3(); for (let i = 0; i < 7; i++) c.add(sky.star(i)); c.normalize().add(sky.star(7)).normalize();
      c.y = Math.max(0.3, c.y * 0.8); c.normalize();
      const pos = new THREE.Vector3(sx + 1.3, gy + 0.85, sz + 5.6);
      k.nav.setPose({ pos, look: pos.clone().addScaledVector(c, 40), fov: 70, yaw: 30, up: 20, down: 10 });
      k.life?.npcs.kid1?.attend(new THREE.Vector3(sx, gy + 8, sz - 20));
      emit();
    },
    exit() {
      sky.labels.hideAll('dip'); sky.lines.guide(0, null, null);
      const d = dipperA(); if (d) sky.lines.set(d.i, 0, 1.2);
      sky.stars.highlight(null);
      k.player.av.reach('R', null); k.life?.npcs.kid1?.attend(null);
    },
    update() {
      // 手指着最近点出来的那颗星
      const last = step >= 2 ? 7 : found.lastIndexOf(true);
      if (last >= 0) {
        k.player.av.joints.chest.getWorldPosition(hand);
        k.player.av.reach('R', hand.addScaledVector(sky.star(last), 0.52).add(new THREE.Vector3(-0.16, 0.12, 0)));
        k.player.av.lookAt(hand.clone().addScaledVector(sky.star(last), 30));
      }
    },
    input: {
      tap(p) {
        const dir = k.world.ray(p.nx, p.ny).ray.direction;
        let best = -1, bd = 0.058;
        for (let i = 0; i < 8; i++) { const ang = Math.acos(Math.min(1, dir.dot(sky.star(i)))); if (ang < bd) { bd = ang; best = i; } }
        if (best < 0) return true;
        if (step === 0 && best < 7 && !found[best]) {
          found[best] = true; label(best); k.sfx('starTap', { vel: 0.5 }); k.buzz(6);
          sky.stars.highlight(new Map(found.map((f, i) => [sky.data.dipper[i], f ? 0.8 : 0] as [number, number]).filter((x) => x[1] > 0)));
          if (found.slice(0, 7).every(Boolean)) {
            step = 1;
            // 七颗齐了：勺子描出来；斗口两星引一道虚线往北极星去
            const d = dipperA(); if (d) sky.lines.set(d.i, 0.75, 1.2, true);
            const a = eqOf(1), b = eqOf(0), ext = [b[0] + (b[0] - a[0]) * 5.2, b[1] + (b[1] - a[1]) * 5.2, b[2] + (b[2] - a[2]) * 5.2], l = Math.hypot(ext[0], ext[1], ext[2]);
            sky.lines.guide(0, b, [ext[0] / l, ext[1] / l, ext[2] / l], 0.55);
          }
          emit();
        } else if (step === 1 && best === 7) {
          found[7] = true; step = 2; label(7); k.sfx('starLight', { vel: 0.7 }); k.buzz(12);
          k.log({ kind: 'dipper', text: `斗柄指${handle()}` });
          emit();
        }
        return true;
      },
    },
    cmd(name) { if (name === 'done') k.exitAct(); },
  };
  return act;
}
