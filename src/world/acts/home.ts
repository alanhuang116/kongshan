/**
 * 屋里屋外的几件事（都由行者去做）：
 *   读联 —— 站在柴门前，抬头看那一副联。
 *   书案 —— 在案前坐下：翻《周易》、翻《皇极经世》（读过几页，显出「天在山中，大畜」），或写两句诗（界面上照着写）。
 *   抚琴 —— 在琴几北的蒲团上盘腿坐下，面朝院子，一声一声地弹；琴不常弹，弹几声就好（显出「雷出地奋，豫」）。
 *   煮茶 —— 跪在茶炉北，面朝院子：扇火候汤，汤滚了攥着提梁提壶注进盏里、放回炉上，候一会儿，端起来品一口（显出「水在火上，既济」）。
 *   自斟 —— 瓮边舀酒，一杯、两杯，微醉即止（显出「云上于天，需」：饮食宴乐）。
 *   榻   —— 夜里在榻上安歇，一觉到天亮；白天小憩一会儿。
 *   先天图 —— 北墙上那一幅六十四卦方圆图，看一看，可翻开观象册。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { merge, norm } from '../core/geo';
import { wash } from '../ink/ink';
import { HALL_Y } from '../walk';
import type { Act } from './types';
import { ease, hold, jpos, lift } from './util';
import { anchor, before, behindSeat, deck, PAGES, POEMS, pairFor, part, poemOf, shot, sitDown, V, WORDS, yiWord } from './lib';
import { inActNow, reveal } from './xiang';

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
        // 写成的两句誊一张带在身上（可以念给韩翁听、送人）
        k.bag.add('poem', 1);
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
  // 坐处朝南（朝着院子）：他的前、右（琴首在他的右手）
  const fw = V(Math.sin(seat.rotation.y), 0, Math.cos(seat.rotation.y)), rt = V(-Math.cos(seat.rotation.y), 0, Math.sin(seat.rotation.y));
  const hint = () => set({ kind: 'qin', title: '抚琴', hint: '琴不常弹。轻点画面，一声一声地弹', count: n, choices: [{ id: 'done', label: '罢' }] });
  return {
    id: 'qin', name: '抚琴', anchor: strings.position.clone().add(V(0, 0.6, 0)), spot: behindSeat(seat, 0.42), radius: 2.0, state, noZoom: true,
    enter() {
      n = 0; step = 'play';
      const av = k.player.av;
      // 坐到蒲团上盘腿（蒲团在琴几北边，腿伸进琴几底下），面朝南
      sitDown(k, seat, { ground: HALL_Y, mat: { h: Math.max(0.005, seat.position.y - HALL_Y), r: 0.26 } });
      av.setHands('free'); av.lookAt(strings.position);
      // 机位：屋里，人的左后方、略低——看得见他的背影、两手与琴，越过他是敞着的院子（菊圃、桃、柳）
      k.nav.setPose(shot(strings.position.clone().addScaledVector(fw, -0.2), 2.6, 2.3, 0.8, 0.3, 46, { yaw: 22, up: 10, down: 8 }), 1.8);
      hint();
    },
    exit() { const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); },
    update(dt) {
      if (step !== 'play') return;
      const av = k.player.av, q = QIN[n % QIN.length];
      pluck = Math.max(0, pluck - dt * 4);
      // 右手在岳山那一头（他的右手边）勾弦，左手在徽位上按、走（往琴尾那边）；弦在他身前，手略往怀里收一点
      R.copy(strings.position).addScaledVector(rt, 0.36).addScaledVector(fw, -(0.04 - 0.03 * pluck)).add(V(0, 0.035 + 0.02 * pluck, 0));
      L.copy(strings.position).addScaledVector(rt, -(0.06 + q[0])).addScaledVector(fw, -0.02).add(V(0, 0.03, 0));
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
/**
 * 跪在炉北，面朝南（朝着院子）。一步一步：
 *   扇火 —— 右手从膝边拿起蒲扇，点画面扇一扇（火着起来以后自己也慢慢热）；
 *   注茶 —— 汤滚了，点画面：扇子放回去，右手从上头攥住提梁把壶提起来，挪到右手边茶床的盏上头，一倾注满，扶正，放回炉上；
 *   候茶 —— 茶在盏里慢慢舒展开，盏上起一缕热气（等一会儿才能品：点画面或点「品」）；
 *   品茶 —— 右手端起盏、左手托着盏底，送到嘴边品一口，再放回茶床上；
 *   然后显出「水在火上，既济」，另盛一碗带着（李公要热茶）。
 * 壶、盏、扇都由这里在世界里摆（不挂在手上：壶要一直正着，只在注的时候顺着提梁倾），手攥着提梁、端着盏跟过去（reach 的 grip）。
 */
const TEA_POUR = 0.62;          // 注茶时壶倾多少（弧度，绕提梁）
function tea(k: Anlewo): Act | null {
  const st = anchor(k, 'stove'), kettle = part(k, 'kettle'), cup = part(k, 'cup1'), fan = part(k, 'fan');
  if (!st) return null;
  const { state, set, undo, restore } = base(k);
  type Step = 'fan' | 'pour' | 'steep' | 'drink' | 'done';
  type Wisp = { amount: number; on: boolean; dispose(): void };
  let heat = 0, wave = 0, step: Step = 'fan', t = 0, said = -1, ready = false, pick = 0, sipped = false;
  let wisp: Wisp | null = null, cupWisp: Wisp | null = null, stream: THREE.Mesh | null = null;
  // 跪处的朝向（面朝南）与他的前、右、上
  const yaw0 = st.rotation.y + Math.PI, F = V(Math.sin(yaw0), 0, Math.cos(yaw0)), R = V(-Math.cos(yaw0), 0, Math.sin(yaw0)), U = V(0, 1, 0), DOWN = V(0, -1, 0), LEFT = R.clone().negate();
  // 壶、盏、扇原来在哪（世界）
  const N = () => new THREE.Vector3();
  const kHome = N(), kQ = new THREE.Quaternion(), cHome = N(), fHome = N(), fQ = new THREE.Quaternion();
  const kp = N(), bail = N(), spout = N(), cp = N(), tmp = N(), tmp2 = N(), head = N(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const fy = N(), fz = N(), fx = N();
  /** 注茶时壶（提梁顶）该在哪：壶嘴正对着盏，嘴尖比盏口高一掌 */
  const pourAt = (out: THREE.Vector3) => {
    const sp = kettle?.userData.spout as THREE.Vector3 | undefined, sx = sp?.x ?? 0.14, sy = sp?.y ?? -0.09;
    const ox = sx * Math.cos(TEA_POUR) + sy * Math.sin(TEA_POUR), oy = -sx * Math.sin(TEA_POUR) + sy * Math.cos(TEA_POUR);
    // 壶嘴朝 R（他的右手边）：提梁顶在盏的另一侧 ox 处、比嘴尖高 −oy
    return out.copy(cHome).addScaledVector(R, -ox).setY(cHome.y + 0.04 + 0.075 - oy);
  };
  const stage = () => (heat < 0.34 ? 0 : heat < 0.67 ? 1 : heat < 1 ? 2 : 3);
  const show = () => {
    const sg = stage();
    if (sg === said && step === 'fan') { state.progress = heat; k.emitAct(); return; }
    said = sg;
    const words = ['炭红了，壶还是凉的。点画面扇一扇；煮好了盛一碗带着，可以送人', '水响了，像风过松林', '起了细细的小泡', '滚了。点画面，提壶注茶'];
    set({ kind: 'tea', title: '煮茶', hint: words[sg], progress: heat, choices: [{ id: 'done', label: '罢' }] });
  };
  const setKettle = (p: THREE.Vector3, tilt: number) => {
    if (!kettle) return;
    kettle.position.copy(p);
    kettle.quaternion.copy(kQ).multiply(qa.setFromAxisAngle(V3Z, -tilt));
  };
  const toPour = () => {
    step = 'pour'; t = 0;
    set({ kind: 'tea', title: '煮茶', hint: '提壶注茶', progress: 1, choices: [{ id: 'done', label: '罢' }] });
  };
  const toSteep = () => {
    step = 'steep'; t = 0; ready = false;
    k.events.loop?.('kettle', 0.15);
    if (cup) cupWisp = k.fx?.smoke(cHome.clone().add(V(0, 0.06, 0)), { size: 0.12, rise: 0.22, amount: 0.7, warm: 0 }) ?? null;
    set({ kind: 'tea', title: '候茶', hint: '茶在盏里慢慢舒展开', progress: 0, choices: [{ id: 'done', label: '罢' }] });
  };
  const toDrink = () => {
    if (step !== 'steep' || !ready) return;
    step = 'drink'; t = 0; sipped = false;
    set({ kind: 'tea', title: '品茶', hint: '端起来，品一口', choices: [{ id: 'done', label: '罢' }] });
  };
  const toDone = () => {
    step = 'done';
    const av = k.player.av; av.reach('R', null); av.reach('L', null); av.lookAt(st.position); av.bow = 0;
    if (cupWisp) cupWisp.amount = 0.25;
    // 另盛一碗带着（李公要热茶）
    k.bag.add('tea', 1);
    const r = reveal(k, '既济');
    set({ kind: 'xiang', title: '煮茶', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '罢' }] });
  };
  return {
    id: 'tea', name: '煮茶', anchor: st.position.clone().add(V(0, 0.5, 0)), spot: before(st, 0.58), radius: 2.0, state, noZoom: true,
    enter() {
      heat = 0; wave = 0; step = 'fan'; t = 0; said = -1; ready = false; pick = 0;
      const av = k.player.av;
      av.setPose('kneel', 1.0); av.setHands('free'); av.lookAt(st.position);
      // 机位：屋里，从西边看他的右侧——提壶、注茶、端盏都看得见；他面朝的南边（画面右手）是门外的院子
      // （看的是人与炉之间：竖屏上人不落到边上）
      k.nav.setPose(shot(st.position.clone().addScaledVector(F, -0.28), -1.6, 1.95, 0.95, 0.12, 46, { yaw: 22, up: 12, down: 8 }), 1.6);
      // 壶、盏、扇拿到世界里来自己摆（退出时放回原处）
      if (kettle) { kettle.getWorldPosition(kHome); kettle.getWorldQuaternion(kQ); undo.push(lift(k.world.scene, kettle)); }
      if (cup) { cup.getWorldPosition(cHome); undo.push(lift(k.world.scene, cup)); }
      if (fan) { fan.getWorldPosition(fHome); fan.getWorldQuaternion(fQ); undo.push(lift(k.world.scene, fan)); }
      if (!kettle) kHome.copy(st.position).add(V(0, 0.2, 0));
      wisp = k.fx?.smoke(kHome.clone().add(V(0, -0.06, 0)), { size: 0.35, rise: 0.5, amount: 0, warm: 0 }) ?? null;
      show();
    },
    exit() {
      restore(); wisp?.dispose(); wisp = null; cupWisp?.dispose(); cupWisp = null;
      if (stream) stream.visible = false;
      k.events.loop?.('kettle', 0);
      const av = k.player.av; av.reach('R', null); av.reach('L', null); av.lookAt(null); av.bow = 0;
    },
    update(dt) {
      const av = k.player.av;
      t += dt;
      wave = Math.max(0, wave - dt * 2.6);
      if (step === 'fan') {
        // 火着起来以后自己也会慢慢热
        heat = Math.min(1, heat + dt * (heat > 0.15 ? 0.045 : 0));
        if (wisp) wisp.amount = Math.max(0, (heat - 0.25) * 1.3);
        k.events.loop?.('kettle', Math.max(0, heat - 0.1));
        // 右手拿起膝边的蒲扇（扇子先在地上，手探下去，扇子起来到手里），对着炉口一下一下地扇
        pick = Math.min(1, pick + dt / 1.1);
        if (fan) {
          // 扇的时候：扇面对着炉口（炉北面那个风口）、离一掌，柄斜着朝右后上方到手里；扇一下，腕子一抖，扇面绕柄翻过去又回来
          const sw = Math.sin(wave * Math.PI * 2.2) * wave;
          const mouth = tmp.copy(st.position).addScaledVector(F, -0.146).setY(HALL_Y + 0.09);
          const blade = tmp2.copy(mouth).addScaledVector(F, -0.15).addScaledVector(R, 0.05 * sw).addScaledVector(U, 0.05);
          fy.copy(F).multiplyScalar(0.35).addScaledVector(U, -0.85).addScaledVector(R, -0.28).normalize();     // 柄 → 扇面
          const g = cp.copy(blade).addScaledVector(fy, -Number((fan.userData.blade as THREE.Vector3 | undefined)?.y ?? 0.22));
          // （扇面略朝他的右手边侧过来一点：从西边的机位看得见扇面，不是一条边）
          fz.copy(F).multiplyScalar(0.8).addScaledVector(R, 0.6).addScaledVector(fy, -F.dot(fy) * 0.8 - R.dot(fy) * 0.6).normalize().applyAxisAngle(fy, 0.7 * sw);
          fx.crossVectors(fy, fz);
          qb.setFromRotationMatrix(m4.makeBasis(fx, fy, fz));
          const e = smooth01((pick - 0.3) / 0.35);
          fan.position.copy(fHome).lerp(g, e); fan.quaternion.copy(fQ).slerp(qb, e);
          // 手：先探向扇子（够不到地，扇子迎上来），拿到了就攥着柄
          if (pick < 0.45) av.reach('R', tmp.copy(fHome).addScaledVector(U, 0.22).lerp(fan.position, smooth01(pick / 0.45)), { rate: 8 });
          else av.reach('R', fan.position, { grip: fy, palm: LEFT, rate: 22 });
          av.bow = pick < 0.6 ? 0.35 : 0.22;
        } else {
          av.reach('R', st.position.clone().addScaledVector(F, -0.22).addScaledVector(U, -0.1).addScaledVector(R, 0.12 * Math.sin(wave * 6)), { rate: 10 });
        }
        show();
      } else if (step === 'pour') {
        // 0–0.6 扇子放回去；0.6–1.2 右手攥住提梁；1.2–2.0 提起来挪到盏上；2.0–2.4 倾；2.4–3.6 注；3.6–3.95 扶正；3.95–4.85 挪回炉上放下；5.0 松手
        if (fan) {
          const e = smooth01(t / 0.6);
          if (e < 1) { fan.position.lerp(fHome, Math.min(1, e * 1.4)); fan.quaternion.slerp(fQ, Math.min(1, e * 1.4)); av.reach('R', fan.position, { grip: fy, palm: LEFT, rate: 22 }); }
          else { fan.position.copy(fHome); fan.quaternion.copy(fQ); }
        }
        const gp = pourAt(tmp2), up = tmp.copy(kHome).addScaledVector(U, 0.07);
        if (t < 1.2) kp.copy(kHome);
        else if (t < 1.5) kp.lerpVectors(kHome, up, smooth01((t - 1.2) / 0.3));
        else if (t < 2.0) kp.lerpVectors(up, gp, smooth01((t - 1.5) / 0.5)).addScaledVector(U, 0.04 * Math.sin(Math.PI * (t - 1.5) / 0.5));
        else if (t < 3.95) kp.copy(gp);
        else if (t < 4.55) kp.lerpVectors(gp, up, smooth01((t - 3.95) / 0.6)).addScaledVector(U, 0.04 * Math.sin(Math.PI * (t - 3.95) / 0.6));
        else if (t < 4.85) kp.lerpVectors(up, kHome, smooth01((t - 4.55) / 0.3));
        else kp.copy(kHome);
        const tilt = t < 2.0 ? 0 : t < 2.4 ? TEA_POUR * smooth01((t - 2.0) / 0.4) : t < 3.6 ? TEA_POUR + 0.05 * (t - 2.4) / 1.2 : t < 3.95 ? (TEA_POUR + 0.05) * (1 - smooth01((t - 3.6) / 0.35)) : 0;
        setKettle(kp, tilt);
        // 手攥着提梁（提梁顺着壶自己的 z 轴，横在掌心里；手背朝上）
        if (t > 0.6 && t < 5.0) {
          bail.set(0, 0, 1).applyQuaternion(kettle ? kettle.quaternion : kQ);
          const kd = tmp.set(0, -1, 0).applyQuaternion(kettle ? kettle.quaternion : kQ);
          av.reach('R', kp, { grip: bail, palm: kd, rate: t < 1.2 ? 9 : 26 });
        } else if (t >= 5.0) av.reach('R', null);
        av.bow = t < 1.4 ? 0.32 : t < 3.95 ? 0.14 : t < 4.9 ? 0.3 : 0.05;
        av.lookAt(t > 1.6 && t < 4.0 ? cHome : st.position);
        // 一道细细的水注：壶嘴到盏里
        const flow = t > 2.25 && t < 3.75 ? Math.min(1, (t - 2.25) / 0.12, (3.75 - t) / 0.12) : 0;
        if (flow > 0 && kettle && cup) {
          if (!stream) stream = makeStream(k);
          spout.copy((kettle.userData.spout as THREE.Vector3 | undefined) ?? V(0.14, -0.09, 0)).applyQuaternion(kettle.quaternion).add(kettle.position);
          const bot = tmp.copy(cHome).addScaledVector(U, 0.02), top = spout;
          stream.visible = true;
          stream.position.copy(top);
          stream.scale.set(1, Math.max(0.01, top.distanceTo(bot)) * flow, 1);
          stream.quaternion.setFromUnitVectors(DOWN, tmp2.subVectors(bot, top).normalize());
        } else if (stream) stream.visible = false;
        if (t > 2.3 && t - dt <= 2.3) k.sfx('pour', { vel: 0.55 });
        if (t > 5.3) toSteep();
      } else if (step === 'steep') {
        // 候一会儿：盏上起一缕热气；够了就能品
        const need = 2.6;
        if (!ready && t >= need) {
          ready = true;
          set({ kind: 'tea', title: '候茶', hint: '茶好了。点画面，或点「品」', progress: 1, choices: [{ id: 'sip', label: '品', main: true }, { id: 'done', label: '罢' }] });
        } else if (!ready && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { state.progress = Math.min(1, t / need); k.emitAct(); }
        av.lookAt(cHome); av.bow = 0.08;
      } else if (step === 'drink' && cup) {
        // 0–0.8 右手端住盏；0.8–1.6 端到胸前，左手托住盏底；1.6–2.3 送到嘴边；2.3–3.5 品；3.5–4.2 放回胸前；4.2–5.0 放回茶床；5.4 松手
        jpos(av.joints.head, head);
        const chest = tmp.copy(head).addScaledVector(F, 0.26).addScaledVector(U, -0.36);
        const mouth = tmp2.copy(head).addScaledVector(F, 0.115).addScaledVector(U, -0.075);
        if (t < 0.8) cp.copy(cHome);
        else if (t < 1.6) cp.lerpVectors(cHome, chest, smooth01((t - 0.8) / 0.8));
        else if (t < 2.3) cp.lerpVectors(chest, mouth, smooth01((t - 1.6) / 0.7));
        else if (t < 3.5) cp.copy(mouth);
        else if (t < 4.2) cp.lerpVectors(mouth, chest, smooth01((t - 3.5) / 0.7));
        else if (t < 5.0) cp.lerpVectors(chest, cHome, smooth01((t - 4.2) / 0.8));
        else cp.copy(cHome);
        // 品的时候盏口朝嘴边倾一点
        const tip = t > 2.1 && t < 3.6 ? 0.42 * Math.sin(Math.PI * Math.min(1, (t - 2.1) / 1.5)) : 0;
        cup.position.copy(cp); cup.quaternion.setFromAxisAngle(R, tip);
        if (cupWisp) cupWisp.amount = t < 0.8 ? 0.7 : 0;
        // 右手捏着盏的右侧（手心朝盏），左手在盏底托着（手心朝上）
        if (t < 5.3) av.reach('R', tmp.copy(cp).addScaledVector(R, 0.056).addScaledVector(U, 0.022), { dir: tmp2.copy(F).multiplyScalar(0.85).addScaledVector(U, 0.35).normalize(), palm: LEFT, rate: t < 0.8 ? 9 : 28 });
        else av.reach('R', null);
        if (t > 0.9 && t < 4.4) av.reach('L', tmp.copy(cp).addScaledVector(U, -0.02).addScaledVector(R, -0.012), { dir: R, palm: U, rate: 12 });
        else av.reach('L', null);
        av.bow = t < 0.9 || (t > 4.1 && t < 5.2) ? 0.3 : 0.05;
        av.lookAt(t > 1.8 && t < 3.5 ? head.clone().addScaledVector(F, 1).addScaledVector(U, 0.12) : cp);
        if (!sipped && t > 2.6) { sipped = true; k.sfx('cup', { vel: 0.25 }); }
        if (t > 5.5) toDone();
      } else if (step === 'drink') toDone();
    },
    input: {
      tap() {
        if (step === 'fan') {
          if (heat < 1) { heat = Math.min(1, heat + 0.12); wave = 1; k.sfx('fan', { vel: 0.4 }); }
          else toPour();
        } else if (step === 'steep') toDrink();
        return true;
      },
    },
    cmd(c) {
      if (c === 'sip') toDrink();
      else if (c === 'done') { if (step === 'done') k.log({ kind: 'tea' }); k.exitAct(); }
    },
  };
}
const V3Z = new THREE.Vector3(0, 0, 1);
const smooth01 = (x: number) => ease(x);
/** 注茶时那一道细细的水注（竖着的一根细筒，顶在壶嘴、底在盏里；长短由 scale.y 给） */
function makeStream(k: Anlewo): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.0032, 0.0042, 1, 6, 1, true).translate(0, -0.5, 0);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  const m = new THREE.Mesh(g, wash({ pig: [0.86, 0.9, 0.93], dens: 0.7, body: 1, shade: 1.1, line: 0 }));
  m.name = 'tea:stream'; m.frustumCulled = false; m.visible = false;
  k.world.scene.add(m);
  return m;
}

// —— 自斟 ——
/**
 * 夜里自斟（点了灯以后，观象「需」：屋里炉火正旺，水壶坐在火上，还没开）：西间那只泥炉生着火——风口里几条火舌、几块红炭，
 * 夜里四周一圈火光；壶坐在炉上，壶嘴里冒一缕细细的热气。白天自斟不生火。返回熄火（收走）的那一手。
 */
function lightStove(k: Anlewo, st: THREE.Object3D): () => void {
  const g = new THREE.Group(), F = new THREE.Vector3(0, 0, -1).applyAxisAngle(V(0, 1, 0), st.rotation.y + Math.PI);
  const flame = wash({ pig: [1, 0.72, 0.4], dens: 1, body: 1, flat: 1, line: 0, glow: [0.95, 0.5, 0.16], snow: 0, vertexColors: false });
  const coal = wash({ pig: [0.98, 0.52, 0.34], dens: 1, body: 0.8, flat: 0.6, line: 0, glow: [0.7, 0.22, 0.06], snow: 0, vertexColors: false });
  // 风口：炉北面（跪着煮茶的人那一面）离炉心十三四公分、离炉底七八公分。几何各并成一块：风口的火舌、壶底的火舌、炭与那一圈红（三次绘制）
  const mouth = st.position.clone().addScaledVector(F, 0.13).setY(HALL_Y + 0.07), top = st.position.clone().setY(st.position.y - 0.02);
  const cone = (r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0) => norm(new THREE.ConeGeometry(r, h, 6, 1, true).translate(0, h / 2, 0)).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z));
  const vent = new THREE.Mesh(merge([0, 1, 2].map((i) => cone(0.022 - i * 0.004, 0.09 - i * 0.015, (i - 1) * 0.022, 0, 0))), flame);
  vent.position.copy(mouth); g.add(vent);
  const lick = new THREE.Mesh(merge(Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2 + 0.3; return cone(0.016, 0.075 + 0.02 * (i % 3), Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, Math.sin(a) * 0.35, -Math.cos(a) * 0.35); })), flame);
  lick.position.copy(top); g.add(lick);
  const coals = [0, 1, 2, 3].map((i) => norm(new THREE.SphereGeometry(0.016, 6, 4).scale(1.3, 0.7, 1)).translate(mouth.x + (i - 1.5) * 0.02, mouth.y - 0.012, mouth.z + 0.012 * (i % 2)));
  coals.push(norm(new THREE.TorusGeometry(0.108, 0.007, 4, 20).rotateX(Math.PI / 2)).translate(top.x, top.y + 0.01, top.z));
  g.add(new THREE.Mesh(merge(coals), coal));
  g.name = 'stoveFire';
  k.world.scene.add(g);
  // 壶嘴里一缕热气（还没开：细细的）
  const kettle = part(k, 'kettle'), sp = kettle ? (kettle.userData.spout as THREE.Vector3 | undefined) : undefined;
  const spout = kettle && sp ? sp.clone().applyQuaternion(kettle.getWorldQuaternion(new THREE.Quaternion())).add(kettle.getWorldPosition(new THREE.Vector3())) : st.position.clone().add(V(0, 0.2, 0));
  const wisp = k.fx?.smoke(spout, { size: 0.05, rise: 0.45, amount: 0.45, warm: 0 }) ?? null;
  let tt = 0;
  const tick = (dt: number) => { tt += dt; vent.scale.y = 0.8 + 0.25 * Math.sin(tt * 8) + 0.1 * Math.sin(tt * 15); lick.scale.y = 0.8 + 0.22 * Math.sin(tt * 9.7 + 1) + 0.1 * Math.sin(tt * 17 + 2); lick.rotation.y = 0.3 * Math.sin(tt * 1.3); };
  k.world.tick.push(tick);
  k.events.loop?.('kettle', 0.08);
  return () => {
    const i = k.world.tick.indexOf(tick); if (i >= 0) k.world.tick.splice(i, 1);
    g.removeFromParent(); g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    wisp?.dispose(); k.events.loop?.('kettle', 0);
  };
}
function wine(k: Anlewo): Act | null {
  const jar = anchor(k, 'jar'), ladle = part(k, 'ladle'), cup = part(k, 'wineCup'), stove = anchor(k, 'stove');
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
      // 夜里（点了灯）：炉子生上火、壶坐在火上；镜头从东南看进西间，瓮边的人与那一炉火都在画里
      if (stove && inActNow(k, '需')) {
        undo.push(lightStove(k, stove));
        // （竖着拿的手机画幅窄：退远一点，两样都框得进）
        const mid = jar.position.clone().lerp(stove.position, 0.55).setY(HALL_Y + 0.5), tall = k.world.camera.aspect < 1;
        k.nav.setPose({ pos: tall ? new THREE.Vector3(0.9, HALL_Y + 2.5, 5.9) : new THREE.Vector3(0.35, HALL_Y + 1.85, 3.75), look: mid, fov: 46, yaw: 18, up: 10, down: 8 }, 1.6);
      } else k.nav.setPose(shot(jar.position, jar.rotation.y + 0.95, 2.4, 0.95, 0.4, 42, { yaw: 22, up: 10, down: 8 }), 1.6);
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
          // 第三杯：点了灯以后（文档写「夜间，灯火亮时」）才显「需」；白天只是微醺，不显卦
          else if (inActNow(k, '需')) { const r = reveal(k, '需'); k.log({ kind: 'wine', n: cups }); set({ kind: 'xiang', title: '微醉即止', gua: r.gua, found: r.found, choices: [{ id: 'done', label: '罢' }] }); }
          else { k.log({ kind: 'wine', n: cups }); idle({ hint: '微醉即止' }); }
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
      set({ kind: 'rest', title: night && !k.shared ? '安歇' : '小憩', hint: k.shared ? '同游时随园中天时：躺一会儿就起' : night ? '夜深了。一觉到天亮' : '歇一会儿' });
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
        if (t > 1.9) {
          phase = 'done'; k.veil = 0; k.world.fpsCap = 0; k.log({ kind: 'rest' });
          if (k.shared) set({ kind: 'read', title: '起来', text: '歇了一会儿，起来了。', choices: [{ id: 'done', label: '起身' }] });
          else set({ kind: 'read', title: '醒来', lines: wake?.lines ?? [], text: wake ? undefined : '醒了，窗纸已白。', source: wake ? `${wake.author}《${wake.title}》　${wake.source}` : undefined, choices: [{ id: 'done', label: '起身' }] });
        }
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
