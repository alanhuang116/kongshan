/**
 * 屋里屋外的几件事（都由行者去做）：
 *   读联 —— 站在柴门前，抬头看那一副联。
 *   书案 —— 在案前坐下：翻《周易》、翻《皇极经世》（读过几页，显出「天在山中，大畜」），或写两句诗（界面上照着写）。
 *   抚琴 —— 在琴几前的席上盘腿坐下，一声一声地弹；琴不常弹，弹几声就好（显出「雷出地奋，豫」）。
 *   煮茶 —— 蹲在茶炉前扇火候汤，汤滚了提壶注茶（显出「水在火上，既济」）。
 *   自斟 —— 瓮边舀酒，一杯、两杯，微醉即止（显出「云上于天，需」：饮食宴乐）。
 *   榻   —— 夜里在榻上安歇，一觉到天亮；白天小憩一会儿。
 *   先天图 —— 北墙上那一幅六十四卦方圆图，看一看，可翻开观象册。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { HALL_Y } from '../walk';
import type { Act } from './types';
import { ease, hold, jpos, lift } from './util';
import { anchor, before, behindSeat, deck, PAGES, POEMS, pairFor, part, poemOf, shot, sitDown, V, WORDS, yiWord } from './lib';
import { reveal } from './xiang';

type Set = (p: Record<string, unknown>) => void;
/** 一件事的骨架：state 的写法、退出时要还原的东西 */
function base(k: Anlewo) {
  const undo: Array<() => void> = [];
  const state: Record<string, unknown> = {};
  const set: Set = (p) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  const restore = () => { while (undo.length) undo.pop()!(); };
  return { state, set, undo, restore };
}

// —— 读联 ——
function couplet(k: Anlewo): Act | null {
  const a = anchor(k, 'couplet');
  if (!a) return null;
  const { state, set } = base(k);
  const honest = WORDS?.honest.find((s) => s.includes('闭门')) ?? '这副联常见于明人陈继儒《小窗幽记》一类的清言集里，是后人的句子；这里挂在门上，是这一处园子的意思。';
  return {
    id: 'couplet', name: '读联', anchor: a.position.clone().add(V(0, 0.75, 0)), spot: before(a, 2.3), radius: 2.6, state,
    enter() {
      const av = k.player.av;
      av.setHands('sleeve'); av.lookAt(a.position.clone().add(V(0.6, 0.2, 0)));
      k.nav.setPose(shot(a.position, a.rotation.y, 4.4, -0.35, 0.15, 42, { yaw: 22, up: 16, down: 6 }), 1.6);
      set({ kind: 'read', title: '门联', lines: ['闭门即是深山', '读书随处净土'], text: honest, choices: [{ id: 'done', label: '毕' }] });
      k.log({ kind: 'read', text: '门联' });
    },
    exit() { k.player.av.lookAt(null); },
    cmd(n) { if (n === 'done') k.exitAct(); },
  };
}

// —— 书案 ——
function desk(k: Anlewo): Act | null {
  const seat = anchor(k, 'deskSeat'), top = anchor(k, 'desk');
  if (!seat || !top) return null;
  const { state, set, undo, restore } = base(k);
  const books: Record<'yi' | 'huangji', { part: THREE.Object3D | null; name: string; next: () => { text: string; source: string; gloss?: string } | null }> = {
    yi: { part: part(k, 'bookYi'), name: '周易', next: deck(PAGES.filter((p) => p.book === 'yi')) },
    huangji: { part: part(k, 'bookHuangji'), name: '皇极经世', next: deck(PAGES.filter((p) => p.book === 'huangji')) },
  };
  const brush = part(k, 'brush'), sheet = part(k, 'sheet');
  /** 书在他面前时的位置：案面上、他胸前那一块 */
  const front = top.position.clone().add(V(0, 0.012, -0.12));
  let mode: 'menu' | 'read' | 'write' | 'done' = 'menu', book: 'yi' | 'huangji' = 'yi', pages = 0, bt = 0, wt = 0;
  let from = new THREE.Vector3(), held: THREE.Object3D | null = null;
  const menu = () => {
    mode = 'menu';
    set({ kind: 'desk', title: '书案', text: '案上两本书，近手处是《周易》与《皇极经世》；诗稿散着。', choices: [{ id: 'yi', label: '翻《周易》' }, { id: 'huangji', label: '翻《皇极经世》' }, { id: 'write', label: '写两句' }, { id: 'done', label: '起身' }] });
  };
  const page = () => {
    const pg = books[book].next();
    pages++;
    k.sfx('page', { vel: 0.45 });
    set({ kind: 'read', title: books[book].name, text: pg?.text ?? '（这一页的字迹淡了。）', source: pg?.source, gloss: pg?.gloss, choices: [{ id: 'more', label: '再翻一页' }, { id: 'close', label: '合上' }] });
  };
  const putBack = () => { if (held) { restore(); held = null; } };
  return {
    id: 'book', name: '书案', anchor: top.position.clone().add(V(0, 0.55, 0)), spot: behindSeat(seat, 0.44), radius: 2.0, state,
    enter() {
      mode = 'menu'; pages = 0;
      const av = k.player.av;
      sitDown(k, seat, { ground: HALL_Y });
      av.setHands('free'); av.lookAt(top.position);
      // 机位：从东南（屋外，南墙已隐去）看进来，人与案、窗都在画里
      k.nav.setPose(shot(top.position, Math.PI * 0.82, 2.6, 0.95, 0.05, 40, { yaw: 24, up: 12, down: 10 }), 1.8);
      menu();
    },
    exit() { putBack(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); },
    update(dt) {
      const av = k.player.av;
      if (mode === 'read' && held) {
        // 书从原处挪到胸前，两手扶着书的两边
        bt = Math.min(1, bt + dt / 0.7);
        held.position.lerpVectors(from, front, ease(bt));
        av.reach('L', held.position.clone().add(V(-0.13, 0.03, 0)), { rate: 6 });
        av.reach('R', held.position.clone().add(V(0.13, 0.03, 0)), { rate: 6 });
        av.lookAt(held.position);
        av.bow = 0.22;
      } else if (mode === 'write' && sheet) {
        // 落笔：右手在纸上缓缓地走，左手按着纸
        wt += dt;
        const p = sheet.position.clone().add(V(0.06 * Math.sin(wt * 1.3) + 0.03 * Math.sin(wt * 4.1), 0.035 + 0.012 * Math.max(0, Math.sin(wt * 6.2)), -0.05 + 0.08 * ((wt * 0.11) % 1)));
        av.reach('R', p, { rate: 9 }); av.reach('L', sheet.position.clone().add(V(-0.2, 0.02, 0.02)), { rate: 5 });
        av.lookAt(sheet.position); av.bow = 0.26;
      } else { av.bow = 0; }
    },
    cmd(n) {
      const av = k.player.av;
      if ((n === 'yi' || n === 'huangji') && mode === 'menu') {
        book = n; mode = 'read'; bt = 0; pages = 0;
        const b = books[n].part;
        if (b) { held = b; from = b.getWorldPosition(new THREE.Vector3()); undo.push(lift(k.world.scene, b)); }
        page();
      } else if (n === 'more' && mode === 'read') page();
      else if (n === 'close' && mode === 'read') {
        putBack(); av.reach('L', null); av.reach('R', null);
        mode = 'done';
        if (pages >= 2) { const r = reveal(k, '大畜'); k.log({ kind: 'read', text: `${books[book].name} ${pages} 页` }); set({ kind: 'xiang', title: '读书', gua: r.gua, found: r.found, choices: [{ id: 'menu', label: '好' }] }); }
        else menu();
      } else if (n === 'menu') menu();
      else if (n === 'write' && mode === 'menu') {
        const p = pairFor(k);
        if (!p) return;
        mode = 'write'; wt = 0;
        if (brush) undo.push(hold(brush, av.joints.handR, [0, 0.05, 0.01], [0, 0, 0]));
        set({ kind: 'write', title: '写两句', model: [p.a, p.b], from: p.from, source: p.source, hint: '照着写；写完了，诗稿就留在案上' });
        state.pair = p;
      } else if (n === 'written' && mode === 'write') {
        const p = state.pair as { a: string; b: string; from: string; source: string };
        restore(); av.reach('R', null); av.reach('L', null);
        mode = 'done';
        k.log({ kind: 'poem', text: `${p.a}，${p.b}。` });
        set({ kind: 'read', title: '诗稿', lines: [p.a, p.b], source: `${p.from}　${p.source}`, choices: [{ id: 'menu', label: '搁笔' }] });
      } else if (n === 'done') k.exitAct();
    },
  };
}

// —— 抚琴 ——
/** 一段很慢的五声：徽位（左手按在哪）与音高（半音，对一根空弦而言） */
const QIN: Array<[number, number]> = [[0.0, 0], [0.12, 2], [0.2, 4], [0.12, 7], [0.0, 9], [0.28, 7], [0.2, 4], [0.32, 2], [0.12, 0], [0.4, -3], [0.0, 0]];
function qin(k: Anlewo): Act | null {
  const seat = anchor(k, 'qinSeat'), strings = anchor(k, 'qin');
  if (!seat || !strings) return null;
  const { state, set } = base(k);
  const pm = poemOf(['guqin', 'tingqin'], '琴');
  let n = 0, pluck = 0, step: 'play' | 'poem' | 'xiang' = 'play';
  const R = new THREE.Vector3(), L = new THREE.Vector3();
  const hint = () => set({ kind: 'qin', title: '抚琴', hint: '琴不常弹。轻点画面，一声一声地弹', count: n, choices: [{ id: 'done', label: '罢' }] });
  return {
    id: 'qin', name: '抚琴', anchor: strings.position.clone().add(V(0, 0.6, 0)), spot: behindSeat(seat, 0.42), radius: 2.0, state, noZoom: true,
    enter() {
      n = 0; step = 'play';
      const av = k.player.av;
      // 席上盘腿坐，往琴前挪近一点（腿伸进琴几底下）
      const s = seat.clone(); s.position.addScaledVector(V(Math.sin(seat.rotation.y), 0, Math.cos(seat.rotation.y)), 0.18);
      sitDown(k, s, { ground: HALL_Y, mat: { h: Math.max(0.005, seat.position.y - HALL_Y), hx: 0.55, hz: 0.32 } });
      av.setHands('free'); av.lookAt(strings.position);
      k.nav.setPose(shot(strings.position, 1.42, 2.1, 0.62, 0.12, 42, { yaw: 22, up: 10, down: 8 }), 1.8);
      hint();
    },
    exit() { const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); },
    update(dt) {
      if (step !== 'play') return;
      const av = k.player.av, q = QIN[n % QIN.length];
      pluck = Math.max(0, pluck - dt * 4);
      // 右手在岳山那一头勾弦，左手在徽位上按、走
      R.copy(strings.position).add(V(0.36, 0.035 + 0.02 * pluck, 0.04 - 0.03 * pluck));
      L.copy(strings.position).add(V(-0.06 - q[0], 0.03, 0.02));
      av.reach('R', R, { rate: 12 }); av.reach('L', L, { rate: 4 });
    },
    input: {
      tap() {
        if (step !== 'play') return true;
        const q = QIN[n % QIN.length];
        n++; pluck = 1;
        k.sfx('qin', { pitch: q[1], vel: 0.55 + 0.15 * Math.random() });
        if (n >= 7) { step = 'poem'; set({ kind: 'read', title: '抚琴', lines: pm?.lines ?? [], text: pm ? undefined : '琴声停了，余音还在屋里。', source: pm ? `${pm.author}《${pm.title}》　${pm.source}` : undefined, choices: [{ id: 'again', label: '再弹几声' }, { id: 'done', label: '罢' }] }); }
        else hint();
        return true;
      },
    },
    cmd(c) {
      if (c === 'again') { step = 'play'; n = 0; hint(); }
      else if (c === 'done') {
        if (step === 'poem' && !k.found.has('豫')) { step = 'xiang'; const r = reveal(k, '豫'); set({ kind: 'xiang', title: '抚琴', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '毕' }] }); return; }
        k.log({ kind: 'qin', n }); k.exitAct();
      }
    },
  };
}

// —— 煮茶 ——
function tea(k: Anlewo): Act | null {
  const st = anchor(k, 'stove'), kettle = part(k, 'kettle');
  if (!st) return null;
  const { state, set, undo, restore } = base(k);
  let heat = 0, fan = 0, step: 'fan' | 'pour' | 'done' = 'fan', pt = 0, wisp: { amount: number; on: boolean; dispose(): void } | null = null, said = -1;
  const kp = new THREE.Vector3();
  const show = () => {
    const stage = heat < 0.34 ? 0 : heat < 0.67 ? 1 : heat < 1 ? 2 : 3;
    if (stage === said && step === 'fan') { state.progress = heat; k.emitAct(); return; }
    said = stage;
    const words = ['炭红了，壶还是凉的。点画面扇一扇', '水响了，像风过松林', '起了细细的小泡', '滚了。点画面，提壶注茶'];
    set({ kind: 'tea', title: '煮茶', hint: words[stage], progress: heat, choices: [{ id: 'done', label: '罢' }] });
  };
  return {
    id: 'tea', name: '煮茶', anchor: st.position.clone().add(V(0, 0.5, 0)), spot: before(st, 0.62), radius: 2.0, state, noZoom: true,
    enter() {
      heat = 0; fan = 0; step = 'fan'; pt = 0; said = -1;
      const av = k.player.av;
      av.setPose('crouch', 1.0); av.setHands('free'); av.lookAt(st.position);
      { const to = Math.atan2(0 - st.position.x, 0 - st.position.z); k.nav.setPose(shot(st.position, to, 1.9, 0.85, 0.15, 44, { yaw: 22, up: 12, down: 8 }), 1.6); }
      kp.copy(kettle ? kettle.getWorldPosition(new THREE.Vector3()) : st.position);
      wisp = k.fx?.smoke(kp.clone().add(V(0, 0.14, 0)), { size: 0.35, rise: 0.5, amount: 0, warm: 0 }) ?? null;
      show();
    },
    exit() { restore(); wisp?.dispose(); wisp = null; k.events.loop?.('kettle', 0); const av = k.player.av; av.reach('R', null); av.reach('L', null); av.lookAt(null); },
    update(dt) {
      const av = k.player.av;
      fan = Math.max(0, fan - dt * 3);
      if (step === 'fan') {
        // 火着起来以后自己也会慢慢热
        heat = Math.min(1, heat + dt * (heat > 0.15 ? 0.045 : 0));
        av.reach('R', st.position.clone().add(V(0.12 * Math.sin(fan * 6), -0.12, 0.2)), { rate: 10 });
        if (wisp) wisp.amount = Math.max(0, (heat - 0.25) * 1.3);
        k.events.loop?.('kettle', Math.max(0, heat - 0.1));
        show();
      } else if (step === 'pour' && kettle) {
        // 提壶、倾、放回
        pt = Math.min(1, pt + dt / 2.6);
        const up = Math.sin(Math.PI * Math.min(1, pt * 1.15));
        av.reach('R', kp.clone().add(V(0.05 - 0.25 * up, 0.08 + 0.22 * up, 0.12 * up)), { rate: 7 });
        kettle.rotation.z = -0.9 * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (pt - 0.25) / 0.5))));
        if (pt >= 1) {
          restore(); step = 'done'; av.reach('R', null); k.events.loop?.('kettle', 0.15);
          const r = reveal(k, '既济');
          set({ kind: 'xiang', title: '煮茶', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '吃茶' }] });
        }
      }
    },
    input: {
      tap() {
        if (step === 'fan') {
          if (heat < 1) { heat = Math.min(1, heat + 0.12); fan = 1; k.sfx('fan', { vel: 0.4 }); }
          else {
            step = 'pour'; pt = 0;
            if (kettle) undo.push(hold(kettle, k.player.av.joints.handR, [0, 0.02, 0.05], [0, 0, 0]));
            k.sfx('pour', { vel: 0.6 });
            set({ kind: 'tea', title: '煮茶', hint: '注茶', progress: 1 });
            if (!kettle) { step = 'done'; const r = reveal(k, '既济'); set({ kind: 'xiang', title: '煮茶', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '吃茶' }] }); }
          }
        }
        return true;
      },
    },
    cmd(c) { if (c === 'done') { if (step === 'done') k.log({ kind: 'tea' }); k.exitAct(); } },
  };
}

// —— 自斟 ——
function wine(k: Anlewo): Act | null {
  const jar = anchor(k, 'jar'), ladle = part(k, 'ladle'), cup = part(k, 'wineCup');
  if (!jar) return null;
  const { state, set, undo, restore } = base(k);
  const p4 = poemOf(['kuaihuo'], '四长吟');
  const pHalf = POEMS_HALF();
  let cups = 0, phase: 'idle' | 'scoop' | 'drink' = 'idle', t = 0, sway = 0;
  const head = new THREE.Vector3(), mouth = new THREE.Vector3();
  const idle = (extra: Record<string, unknown> = {}) => set({ kind: 'wine', title: '自斟', hint: cups === 0 ? '无客时，自斟自饮。点画面舀一杯' : cups < 3 ? '再斟一杯？' : '', count: cups, choices: [{ id: 'done', label: '罢' }], ...extra });
  return {
    id: 'wine', name: '自斟', anchor: jar.position.clone().add(V(0, 0.55, 0)), spot: before(jar, 0.6), radius: 2.0, state, noZoom: true,
    enter() {
      cups = 0; phase = 'idle'; sway = 0;
      const av = k.player.av;
      av.setHands('free'); av.lookAt(jar.position);
      if (cup) undo.push(hold(cup, av.joints.handL, [0, 0.03, 0.03], [0, 0, 0]));
      k.nav.setPose(shot(jar.position, jar.rotation.y + 0.95, 2.4, 0.95, 0.4, 42, { yaw: 22, up: 10, down: 8 }), 1.6);
      idle();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.bow = 0; },
    update(dt) {
      const av = k.player.av;
      t += dt;
      jpos(av.joints.head, head);
      if (phase === 'scoop') {
        // 舀：右手探进瓮口，再提起来往左手的杯里倒
        const e = Math.min(1, t / 2.2);
        const dip = jar.position.clone().add(V(0, 0.05 - 0.12 * Math.sin(Math.PI * Math.min(1, e * 2)), 0));
        const pour = av.joints.handL.getWorldPosition(new THREE.Vector3()).add(V(0.06, 0.12, 0));
        av.reach('R', e < 0.5 ? dip : pour, { rate: 6 });
        av.bow = e < 0.5 ? 0.3 : 0.05;
        if (e >= 1) { phase = 'drink'; t = 0; av.reach('R', null); k.sfx('pour', { vel: 0.4, pitch: -3 }); }
      } else if (phase === 'drink') {
        // 饮：左手把杯送到嘴边
        const e = Math.min(1, t / 2.0);
        mouth.copy(head).add(V(0, -0.07, 0)).addScaledVector(V(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw)), 0.11);
        av.reach('L', e < 0.75 ? mouth : null, { rate: 5 });
        av.lookAt(e < 0.75 ? head.clone().add(V(0, 0.4, 0)).addScaledVector(V(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw)), 1) : jar.position);
        if (e >= 1) {
          phase = 'idle'; cups++;
          if (cups === 1) idle({ lines: p4?.lines ?? [], source: p4 ? `${p4.author}《${p4.title}》　${p4.source}` : undefined });
          else if (cups === 2) { sway = 1; idle({ lines: pHalf ? [pHalf.a, pHalf.b] : [], source: pHalf?.src }); }
          else { const r = reveal(k, '需'); k.log({ kind: 'wine', n: cups }); set({ kind: 'xiang', title: '微醉即止', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '罢' }] }); }
        }
      }
      // 两杯以后，镜头微微地晃
      if (sway > 0) { const c = k.world.camera; c.rotation.z += Math.sin(t * 0.9) * 0.004 * sway; }
    },
    input: {
      tap() {
        if (phase !== 'idle' || cups >= 3) return true;
        phase = 'scoop'; t = 0;
        if (ladle) undo.push(hold(ladle, k.player.av.joints.handR, [0, 0.04, 0.02], [0, 0, 0]));
        k.sfx('pour', { vel: 0.3, pitch: -5 });
        return true;
      },
    },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
}
/** 「美酒饮教微醉后，好花看到半开时」在哪一首里：按诗句找（找不到就不念） */
function POEMS_HALF(): { a: string; b: string; src: string } | null {
  const hit = POEMS.find((v) => v.lines.some((l) => l.includes('微醉')));
  if (!hit) return null;
  const i = hit.lines.findIndex((l) => l.includes('微醉'));
  return { a: hit.lines[i], b: hit.lines[i + 1] ?? '', src: `${hit.author}《${hit.title}》　${hit.source}` };
}

// —— 榻 ——
function couch(k: Anlewo): Act | null {
  const c = anchor(k, 'couch');
  if (!c) return null;
  const { state, set } = base(k);
  const wake = poemOf(['lanqi'], '懒起');
  let t = 0, phase: 'down' | 'sleep' | 'up' | 'done' = 'down', target = 0;
  const seatAt = new THREE.Object3D();
  return {
    id: 'couch', name: '榻', anchor: c.position.clone().add(V(0, 0.6, 0)), spot: { x: c.position.x, z: c.position.z + 0.72, yaw: 0 }, radius: 2.0, state, noZoom: true,
    enter() {
      t = 0; phase = 'down';
      const night = k.atmos.night > 0.5;
      target = night ? k.hourFor('dawn') : (k.atmos.hour + 1.4) % 24;
      seatAt.position.copy(c.position); seatAt.rotation.y = 0;
      sitDown(k, seatAt, { ground: HALL_Y, mat: { h: c.position.y - HALL_Y, hx: 0.9, hz: 0.38 } });
      k.player.av.setHands('lap');
      k.nav.setPose(shot(c.position, 0.35, 3.0, 1.1, 0.4, 40, { yaw: 18, up: 8, down: 8 }), 1.6);
      set({ kind: 'rest', title: night ? '安歇' : '小憩', hint: night ? '夜深了。一觉到天亮' : '歇一会儿' });
    },
    exit() { k.veil = 0; k.world.fpsCap = 0; },
    update(dt) {
      t += dt;
      const av = k.player.av;
      if (phase === 'down') { av.bow = Math.min(0.5, t * 0.2); if (t > 2.2) { phase = 'sleep'; t = 0; k.world.fpsCap = 30; } }
      else if (phase === 'sleep') {
        // 画面淡成一片雾；雾里换了时辰
        k.veil = Math.min(1, t / 1.6);
        if (t > 1.7 && t - dt <= 1.7) { k.passTo(target); }
        if (t > 2.6) { phase = 'up'; t = 0; if (k.atmos.dawn > 0.2) k.sfx('rooster', { vel: 0.5 }); }
      } else if (phase === 'up') {
        k.veil = Math.max(0, 1 - t / 1.8); av.bow = Math.max(0, 0.5 - t * 0.3);
        if (t > 1.9) { phase = 'done'; k.veil = 0; k.world.fpsCap = 0; k.log({ kind: 'rest' }); set({ kind: 'read', title: '醒来', lines: wake?.lines ?? [], text: wake ? undefined : '醒了，窗纸已白。', source: wake ? `${wake.author}《${wake.title}》　${wake.source}` : undefined, choices: [{ id: 'done', label: '起身' }] }); }
      }
    },
    cmd(n) { if (n === 'done') k.exitAct(); },
  };
}

// —— 先天图 ——
function scroll(k: Anlewo): Act | null {
  const s = anchor(k, 'scroll');
  if (!s) return null;
  const { state, set } = base(k);
  const w1 = yiWord('先天学'), w2 = yiWord('图虽无文');
  return {
    id: 'scroll', name: '先天图', anchor: s.position.clone().add(V(0, 0.5, 0.1)), spot: before(s, 1.5), radius: 2.0, state,
    enter() {
      k.player.av.setHands('sleeve'); k.player.av.lookAt(s.position);
      k.nav.setPose(shot(s.position, 0.72, 3.2, -0.25, -0.05, 42, { yaw: 16, up: 12, down: 10 }), 1.6);
      const text = [w1 ? `「${w1.text}」——${w1.source}` : '', w2 ? `「${w2.text}」——${w2.source}` : ''].filter(Boolean).join('\n') || '六十四卦，外圆内方：圆的是天，方的是地。乾在上，坤在下。';
      set({ kind: 'read', title: '先天图', text, hint: '六十四卦方圆图：外圆象天，内方象地', choices: [{ id: 'album', label: '观象册' }, { id: 'done', label: '毕' }] });
    },
    exit() { k.player.av.lookAt(null); },
    cmd(n) { if (n === 'album') k.events.open?.('album'); else if (n === 'done') k.exitAct(); },
  };
}

export function create(k: Anlewo): Act[] {
  return [couplet(k), desk(k), qin(k), tea(k), wine(k), couch(k), scroll(k)].filter((a): a is Act => !!a);
}
