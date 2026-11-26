/**
 * 取一象、留一盏灯；看路过的灯（play/marks.ts 管数与画）。
 *
 *   取一象（mark）—— 在外头哪里都行（从观象册里点「取一象」）：先仰观，上头是什么——天、泽、火、雷、风、水、山、地，挑一样做上卦；
 *       再俯察，眼前、脚下是什么，挑一样做下卦。两卦叠起来是一卦：出它的象卡（卦辞、大象、白话）。
 *       「留一盏灯」就在脚下留一方发光的印；「再取」重来。这是观物取象，不是起卦，不问吉凶。
 *   路标（mark:0 … mark:3）—— 走近一盏灯，名签上写「路标」：点开看是谁留的、那时是几月、什么时辰、什么天气，与那一象。
 *       几盏挨在一处的，先挑看哪一盏；自己留的可以收回。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act, Spot } from './types';
import { GUA, TRIGRAMS, YI_WORDS } from '../../data/yi';
import { groundAt } from '../walk';
import { ground } from '../site';
import { MAX_MINE, ageText, marksOf, startMarks, whenText, type Mark } from '../play/marks';
import type { Cluster } from '../play/study/cluster';

/** 仰观、俯察那一句（《系辞下》w02 里连着的十二个字） */
const W02 = YI_WORDS.find((w) => w.id === 'w02');
const YANG_FU = W02 && W02.text.includes('仰则观象于天，俯则观法于地') ? { text: '仰则观象于天，俯则观法于地', source: W02.source } : null;
const guaOf = (u: string, l: string) => GUA.findIndex((g) => g.upper === u && g.lower === l);

/** 从界面（观象册）调：在此刻站的地方取一象。不在外头、正在换处时不理，返回 false */
export function takeHere(k: Anlewo): boolean {
  const a = k.acts.mark;
  if (!a || k.nav.busy || k.nav.place.indoor >= 0.5) return false;
  const p = k.player.pos;
  a.spot.x = p.x; a.spot.z = p.z; a.spot.yaw = k.player.yaw;
  k.enterAct('mark', true);
  return true;
}

function take(k: Anlewo): Act {
  const M = startMarks(k);
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  let up: string | null = null, gi = -1, left = false;
  const look = (pitch: number) => {
    const p = k.player.pos, yaw = k.player.yaw, f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const pos = new THREE.Vector3(p.x, p.y + 1.55, p.z).addScaledVector(f, -2.6).add(new THREE.Vector3(Math.cos(yaw) * 0.6, 0, -Math.sin(yaw) * 0.6));
    const at = new THREE.Vector3(p.x, p.y + 1.4, p.z).addScaledVector(f, 10 * Math.cos(pitch)).add(new THREE.Vector3(0, 10 * Math.sin(pitch), 0));
    return { pos, look: at, fov: 50, yaw: 30, up: 14, down: 10 };
  };
  const ask = () => {
    up = null; gi = -1; left = false;
    k.nav.setPose(look(0.5), 1.4);
    k.player.av.lookAt(new THREE.Vector3(k.player.pos.x, k.player.pos.y + 6, k.player.pos.z).addScaledVector(new THREE.Vector3(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw)), 4));
    set({ kind: 'mark', title: '取一象', said: YANG_FU ? `「${YANG_FU.text}」——${YANG_FU.source}` : undefined, text: '先仰观：上头是什么？挑一样做上卦。', tri: { step: 'upper' }, choices: [{ id: 'done', label: '罢' }] });
  };
  return {
    id: 'mark', name: '取一象',
    anchor: new THREE.Vector3(22, -100, 104),
    spot: { x: 22, z: 104, yaw: 0 },
    radius: 0.01, state, noZoom: true,
    // 画面上不出签（从观象册里点「取一象」才进来）
    on: () => false,
    enter() { k.player.av.setHands('sleeve', 0.4); ask(); },
    exit() { k.player.av.lookAt(null); },
    cmd(c, arg) {
      if (c === 'tri' && typeof arg === 'string' && TRIGRAMS.some((t) => t.id === arg)) {
        if (!up) {
          up = arg;
          const U = TRIGRAMS.find((t) => t.id === arg)!;
          k.nav.setPose(look(-0.42), 1.4);
          k.player.av.lookAt(new THREE.Vector3(k.player.pos.x, k.player.pos.y, k.player.pos.z).addScaledVector(new THREE.Vector3(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw)), 2.2));
          set({ kind: 'mark', title: '取一象', said: `上卦取了${U.image}（${U.name}）`, text: '再俯察：眼前、脚下是什么？挑一样做下卦。', tri: { step: 'lower', on: arg }, choices: [{ id: 'redo', label: '重取上卦' }, { id: 'done', label: '罢' }] });
          k.sfx('tick', { vel: 0.3 });
        } else {
          gi = guaOf(up, arg);
          if (gi < 0) return;
          const g = GUA[gi];
          k.nav.setPose(look(0.12), 1.4);
          k.player.av.lookAt(null);
          k.sfx('page', { vel: 0.4 });
          set({ kind: 'mark', title: '取一象', gua: g.name, choices: [{ id: 'leave', label: '留一盏灯', main: true }, { id: 'again', label: '再取' }, { id: 'done', label: '罢' }] });
        }
      } else if (c === 'redo' || c === 'again') ask();
      else if (c === 'leave' && gi >= 0 && !left) {
        left = true;
        const r = M.place(gi), g = GUA[gi];
        k.sfx('lantern', { vel: 0.35 });
        set({
          kind: 'mark', title: '取一象', gua: g.name,
          text: `灯留在这里了。${r.net ? '同游的人路过都看得见，' : '眼下只有你自己看得见（没有连上同游），'}三日后自己熄。${r.dropped ? `一人至多留${['', '一', '两', '三'][MAX_MINE]}盏，最早那一盏收回了。` : ''}`,
          choices: [{ id: 'done', label: '毕' }], done: true,
        });
      } else if (c === 'done') k.exitAct();
    },
  } as Act & { on(): boolean };
}

/** 路过的灯：第 slot 个点得着的那一盏（最近的在前） */
function view(k: Anlewo, slot: number): Act {
  const M = startMarks(k);
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  // 起先放在田里（外头）：总装按建好那一刻站处在不在屋里定「多远看得见名签」，屋里只有七米
  const anchor = new THREE.Vector3(22, -100, 104), spot: Spot = { x: 22, z: 104, yaw: 0 };
  /** 正看着的那一团、那一盏 */
  let cl: Cluster<Mark> | null = null, cur: Mark | null = null;
  const card = (m: Mark) => {
    cur = m;
    const g = GUA[m.g];
    set({
      kind: 'mark', title: '路标', who: `${m.who}${m.mine ? '（你）' : ''}留的一盏灯`, text: `${whenText(m)}　${ageText(m.left)}${m.local && m.mine ? '\n只在你这里看得见（那时没有连上同游）' : ''}`,
      gua: g?.name, choices: [...(m.mine ? [{ id: 'unmark', label: '收回' }] : []), ...(cl && cl.items.length > 1 ? [{ id: 'list', label: '看别的几盏' }] : []), { id: 'done', label: '毕' }],
    });
  };
  const list = () => {
    cur = null;
    if (!cl) return;
    set({ kind: 'mark', title: '路标', text: `这里有${['', '一', '两', '三', '四', '五'][Math.min(5, cl.items.length)] || cl.items.length}盏灯。看哪一盏？`, choices: [...cl.items.map((m, i) => ({ id: `m${i}`, label: `${m.who}${m.mine ? '（你）' : ''}`, sub: `${GUA[m.g]?.name ?? ''}　${whenText(m)}` })), { id: 'done', label: '毕' }] });
  };
  const act: Act & { on(): boolean } = {
    id: `mark:${slot}`, name: '路标', anchor, spot, radius: 2.2, state, noZoom: true,
    on: () => !!M.slots[slot],
    enter() {
      cl = M.slots[slot];
      if (!cl) { k.exitAct(); return; }
      const av = k.player.av, gy = groundAt(cl.x, cl.z) ?? ground(cl.x, cl.z);
      av.setHands('sleeve', 0.4); av.lookAt(new THREE.Vector3(cl.x, gy, cl.z)); av.bow = 0.18;
      const p = k.player.pos, d = new THREE.Vector3(cl.x - p.x, 0, cl.z - p.z).normalize();
      k.nav.setPose({ pos: new THREE.Vector3(p.x - d.x * 2.0 + d.z * 1.2, p.y + 1.9, p.z - d.z * 2.0 - d.x * 1.2), look: new THREE.Vector3(cl.x, gy + 0.3, cl.z), fov: 44, yaw: 24, up: 12, down: 8 }, 1.4);
      if (cl.items.length === 1) card(cl.items[0]); else list();
    },
    exit() { k.player.av.lookAt(null); k.player.av.bow = 0; },
    update() {
      // 没走开时，这一盏的位置挪了（别人收回了）：看着的那一盏没了就说一声、收起
      if (cur && !M.list.some((m) => m.key === cur!.key)) { cur = null; set({ kind: 'mark', title: '路标', text: '这一盏灯已经熄了。', choices: [{ id: 'done', label: '毕' }] }); }
    },
    cmd(c) {
      if (/^m\d+$/.test(c) && cl) { const m = cl.items[Number(c.slice(1))]; if (m) card(m); }
      else if (c === 'list') list();
      else if (c === 'unmark' && cur) {
        const m = cur;
        if (M.take(m)) { k.sfx('lantern', { vel: 0.25 }); set({ kind: 'mark', title: '路标', text: '收回了。', choices: [{ id: 'done', label: '毕' }] }); cur = null; }
      } else if (c === 'done') k.exitAct();
    },
  };
  // 每帧把这一枚挪到它管的那一盏旁边（名签、站处跟着走）
  k.world.tick.push(() => {
    const c = M.slots[slot];
    if (!c || k.act === act) return;
    const gy = groundAt(c.x, c.z) ?? ground(c.x, c.z);
    anchor.set(c.x, gy + 1.15, c.z);
    const s = M.standFor(c, k.player.pos);
    spot.x = s.x; spot.z = s.z; spot.yaw = s.yaw;
  });
  return act;
}

export function create(k: Anlewo): Act[] {
  startMarks(k);
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__takeHere = () => takeHere(k);
  return [take(k), view(k, 0), view(k, 1), view(k, 2), view(k, 3)];
}
/** 册页里列自己留的灯要用（世界还没建好是空的） */
export const myMarks = (): Mark[] => marksOf()?.mine() ?? [];
