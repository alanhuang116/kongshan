/**
 * 后来添进村里的几位（名册在 src/data/folk.ts，一天怎么过照着那里的 plan）：
 *
 *   王大娘 —— 清早喂鸡扫院；春天在菜地锄草，夏天拾麦穗，秋天上场翻晒，冬天在门前纳鞋底；娘家妹子来了坐着说话。
 *   二郎 —— 清早挑水；跟着爹下地：春天碎土，夏天捆麦，秋天扬场；冬天劈柴；雨天在檐下帮爹搓草绳。
 *   赵大嫂 —— 喂鹅；一整天坐在檐下的织机前，投梭、打纬；杏儿坐在一旁。
 *   孙嫂 —— 天不亮推磨磨豆子，点了豆腐挑着挨家去卖；午后坐在酒家凳上拣豆子。
 *   陈篾匠 —— 己家门前坐在小板凳上破篾、编筐，隔一阵起来晾篾片；雨天在檐下编小筐。
 *   陶大 —— 庚家坯棚里拉坯；午后往窑里添柴、把坯摆上架；冬天歇窑，在棚里揉泥。
 *   孟老 —— 上村北的山坡刨药；午后在茶亭边摊开药匾晒药。
 *   冯老汉 —— 清早从东头来，到丁家屋东头的羊圈把羊放出来，赶着在村路东头南边的草地上吃草；傍晚赶回圈（羊是生灵那一路的，见 fauna/api.ts）。
 *   李二（打更的） —— 夜里提着灯笼、敲着梆子绕村；午后在茶亭里打个盹。
 *   韩翁（说书的盲翁） —— 春夏秋的晴天傍晚，拄着杖自东头来，在槐树下支起鼓说书，满村的人围着听。
 *   了然（行脚僧） —— 上午自西边来，在茶亭讨碗茶、坐一坐，再往东去。
 *   刘二姐 —— 春秋的午后挎着一篮鸡蛋从东边来看姐姐，坐在王家门前说话。
 */
import * as THREE from 'three';
import { FAUNA } from './fauna/api';
import type { Person, Script } from './person';
import * as P from './props';
import { A_FRONT, D_FRONT, E_FRONT, F_FRONT, G_WORK, ROUND, STORY, TEA, TEA_MORE, THRESH, VEG, WELL, door, footY, type Spot } from './spots';
import { DOWN, UPV, chatWith, during, feedAct, listenAct, pickWork, ropeWork, setDown, sewWork, shoulder, sitStool, steadyPole, stoolWork, waterAct } from './chores';
import type { Kit } from './people';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const pt = (s: { x: number; z: number }): [number, number] => [s.x, s.z];

/** 北山坡上刨药的几处（walk.ts 查过站得住的） */
const HERB_SPOTS: Array<[number, number]> = [[72, -38], [80, -34], [90, -40], [98, -36], [106, -32], [86, -28], [64, -32]];
/** 放羊的那片草地（村路东头南边、槐树与陶家之间，walk.ts 查过站得住的几处） */
const MEADOW: Array<[number, number]> = [[117, 26], [123, 29], [129, 23], [126, 17], [120, 14], [114, 20], [111, 29], [129, 29], [123, 20]];
/** 冯老汉歇晌的那株树下（草地西边） */
const RESTTREE: Spot = { x: 116.5, z: 20.6, yaw: Math.PI / 2 + 0.9 };

export function addVillagers(k: Kit) {
  const { add, rnd } = k;
  const stoolOf = () => { const s = P.stool(); s.visible = false; return s; };
  const fanOf = () => { const f = P.fan(); f.visible = false; return f; };
  /** 听书的那一件（各人自己的位置、自己搬的矮凳、夏天的蒲扇） */
  const FAN = new Set(['elder', 'elder2', 'farmwife', 'neighbor', 'tofu', 'weaver', 'farmer', 'basketman']);
  const listen = (id: string, kid = false) => listenAct(k, STORY.slots[id], { stool: stoolOf(), fan: FAN.has(id) ? fanOf() : undefined, kid });

  // ———————————————————————— 王大娘 ————————————————————————
  {
    const tray = P.tray(), broom = P.broom(), hoe = P.herbHoe(), stool = stoolOf(), sole = P.shoeSole();
    tray.visible = broom.visible = hoe.visible = sole.visible = false;
    let veg = 0;
    const wife = add('farmwife', 'farmwife', {
      feed: feedAct(k, A_FRONT.feed, tray, { spots: A_FRONT.sweep, broom }),
      /** 菜地里锄草：蹲着，右手的小锄一下一下地刨，左手把拔起来的草往旁边一扔；锄完一处挪一步 */
      *weed(p, c) {
        const f = p.fig;
        for (;;) {
          const s = VEG.at(veg++ % 18);
          yield* p.go(s, 0.9);
          p.pose('crouch'); p.seated = true; p.hold(hoe, 'R');
          p.rest = () => { f.reach('R', null); f.reach('L', null); };
          for (let n = 0; n < 5; n++) {
            yield* p.tween(0.5, (u) => f.reach('R', p.loc(-0.12, lerp(0.22, 0.42, u), 0.42, v1), { dir: p.dir(0, 0.6, 0.8, v2), rate: 12 }));
            yield* p.tween(0.2, (u) => f.reach('R', p.loc(-0.12, lerp(0.42, 0.1, u), lerp(0.42, 0.5, u), v1), { dir: p.dir(0, -0.4, 0.9, v2), rate: 30 }));
            if (n % 2 === 0) c.sfx('dig', p.pos.x, p.pos.z, 0.25);
            if (n === 2) { yield* p.tween(0.8, (u) => f.reach('L', p.loc(lerp(0.1, 0.45, u), lerp(0.08, 0.3, u), lerp(0.45, 0.2, u), v3), { dir: DOWN, rate: 10 })); f.reach('L', null); }
            yield* p.wait(0.3);
          }
          f.reach('R', null);
          p.pose('stand'); p.seated = false;
          yield* p.wait(rnd(0.8, 2));
        }
      },
      glean: k.harvest.glean,
      sun: k.sun(1),
      sew: stoolWork(k, A_FRONT.sew, stool, { props: (p) => p.hold(sole, 'L'), work: sewWork, look: [0.05, 0.62, 0.4] }),
      /** 妹子来了：坐着说话（妹子还没到就先做针线等着） */
      *chat(p) {
        yield* sitStool(p, A_FRONT.chat[0], stool, 0.9);
        p.hold(sole, 'L');
        const aunt = () => k.who('aunt');
        for (;;) {
          const a = aunt();
          if (a?.here && a.seated && a.act === 'visit') { sole.visible = false; p.fig.reach('L', null); yield* chatWith(k, p, aunt, true); }
          sole.visible = true; sewWork(p, p.c.t); yield;
        }
      },
      listen: listen('farmwife'),
    }, [pt(door('a'))]);
    wife.chatty = 0.7;
  }

  // ———————————————————————— 二郎 ————————————————————————
  {
    const load = P.waterLoad(), axe = P.axe(), chop = P.woodChop(), shovel = P.shovel(), stool = stoolOf(), rope = P.ropeHeap();
    load.visible = axe.visible = chop.obj.visible = chop.log.visible = shovel.visible = rope.visible = false;
    k.group.add(chop.obj);
    const son = add('farmson', 'farmson', {
      water: waterAct(k, WELL, load, door('a')),
      hoe: k.hoe(),
      bind: k.harvest.bind,
      /** 扬场：木锨铲起一锨谷，迎着风扬上去，谷粒落下、糠秕飘走 */
      *winnow(p, c) {
        const f = p.fig, st = { x: THRESH.x + 1.6, z: THRESH.z + 1.9, yaw: Math.PI + 0.6 };
        yield* k.toField(p, c, st);
        p.pose('stand'); p.hold(shovel, 'R');
        const tool = (u: number) => {
          const r = p.loc(-0.12, lerp(0.75, 1.35, u), lerp(0.25, 0.32, u), v1), d = v2.set(0.05, lerp(-0.7, 0.75, u), lerp(0.7, 0.6, u)).normalize(), wd = p.dir(d.x, d.y, d.z, v3);
          f.reach('R', r, { dir: wd, palm: UPV, rate: 14 }); f.reach('L', v4.copy(r).addScaledVector(wd, 0.5 * p.scale), { dir: wd, palm: UPV, rate: 14 });
          f.bow = lerp(0.45, 0.02, u);
        };
        p.rest = () => tool(0.2);
        for (;;) {
          yield* p.tween(0.9, () => tool(0));
          yield* p.tween(0.55, (u) => tool(u * u));
          c.sfx('winnow', p.pos.x, p.pos.z, 0.4);
          yield* p.tween(0.4, (u) => tool(1 - 0.2 * u));
          yield* p.wait(rnd(0.6, 1.4));
        }
      },
      noon: k.noon(1),
      /** 劈柴：木墩上立一段木头，两手抡起斧头劈下去；劈开了弯腰再立一段 */
      *chop(p, c) {
        const f = p.fig, s = A_FRONT.chop;
        yield* p.go(s, 0.9);
        const b = p.loc(0, 0, 0.62, new THREE.Vector3());
        setDown(p, chop.obj, { x: b.x, z: b.z, yaw: p.yaw + Math.PI / 2 });
        p.hold(chop.log, 'world'); chop.log.position.set(b.x, footY(b.x, b.z) + 0.42, b.z);
        p.pose('stand'); p.hold(axe, 'R');
        const swing = (u: number) => {
          const r = p.loc(-0.08, lerp(0.85, 1.55, u), lerp(0.42, 0.05, u), v1), d = v2.set(0, lerp(-0.25, 0.95, u), lerp(0.97, -0.3, u)).normalize(), wd = p.dir(d.x, d.y, d.z, v3);
          f.reach('R', r, { dir: wd, palm: UPV, rate: 16 }); f.reach('L', v4.copy(r).addScaledVector(wd, -0.12), { dir: wd, palm: UPV, rate: 16 });
          f.bow = lerp(0.35, 0, u);
        };
        p.rest = () => swing(0);
        for (;;) {
          for (let i = 0; i < 2; i++) {
            yield* p.tween(1.0, (u) => swing(u));
            yield* p.tween(0.22, (u) => swing(1 - u));
            c.sfx('chop', b.x, b.z, 0.55 + 0.2 * k.R());
            yield* p.wait(0.5);
          }
          // 劈开了：木头不见，弯腰把两半扔到柴垛上，再立一段
          chop.log.visible = false;
          yield* p.tween(0.9, (u) => { f.bow = 0.7 * u; swing(0); });
          yield* p.wait(0.8);
          chop.log.visible = true;
          yield* p.tween(0.9, (u) => { f.bow = 0.7 * (1 - u); swing(0); });
          yield* p.wait(rnd(1, 3));
        }
      },
      rope: stoolWork(k, A_FRONT.rope[1], stool, { props: (p) => setDown(p, rope, A_FRONT.rope[1].stool), work: ropeWork, look: [0, 0.4, 0.4] }),
      listen: listen('farmson'),
    }, [pt(door('a'))]);
    son.chatty = 0.3;
  }

  // ———————————————————————— 赵大嫂（织布）与杏儿坐在一旁 ————————————————————————
  const loom = P.loom(), tray2 = P.tray();
  loom.obj.visible = tray2.visible = false;
  k.group.add(loom.obj);
  const placeLoom = () => { const L = D_FRONT.loom; loom.obj.position.set(L.x, footY(L.x, L.z), L.z); loom.obj.rotation.set(0, L.yaw, 0); };
  const weaver = add('weaver', 'weaver', {
    feed: feedAct(k, D_FRONT.feed, tray2, undefined, false),
    /** 织布：右手把梭从经面上推过去、左手接住，两手扳过筘来一打（咔嗒一声）；再从左往右投回来。织一阵直直腰 */
    *weave(p, c) {
      const f = p.fig;
      placeLoom(); p.hold(loom.obj, 'world'); placeLoom();
      yield* p.bench(D_FRONT.weave, 0.9, [pt(door('d'))]);
      p.curious = false;
      const L = loom.obj, sh = loom.shuttle, bt = loom.beater;
      const W = (x: number, y: number, z: number, out: THREE.Vector3) => L.localToWorld(out.set(x, y, z));
      p.rest = () => { f.reach('R', null); f.reach('L', null); bt.rotation.x = 0; };
      for (let n = 0; ; n++) {
        for (const side of [1, -1]) {
          // 投梭：梭从一边滑到另一边，手跟着
          yield* p.tween(0.75, (u) => {
            const x = lerp(0.3 * side, -0.3 * side, u);
            sh.position.set(x, 0.76, 0.12);
            const hand = side > 0 ? (u < 0.5 ? 'R' : 'L') : (u < 0.5 ? 'L' : 'R'), other = hand === 'R' ? 'L' : 'R';
            f.reach(hand, W(x, 0.8, 0.12, v1), { dir: p.dir(0, -0.3, 1, v2), palm: DOWN, rate: 16 });
            f.reach(other, W(-0.32 * side * (hand === 'R' ? -1 : 1), 0.8, 0.15, v3), { dir: p.dir(0, -0.3, 1, v2), palm: DOWN, rate: 10 });
            f.bow = 0.16;
          });
          // 打纬：两手扳筘
          yield* p.tween(0.4, (u) => {
            bt.rotation.x = 0.32 * Math.sin(u * Math.PI);
            const y = 1.05 - 0.3 * Math.cos(bt.rotation.x), z = 0.02 + 0.3 * Math.sin(bt.rotation.x);
            f.reach('R', W(0.18, y, z, v1), { dir: p.dir(0, 0.2, 1, v2), palm: DOWN, rate: 20 }); f.reach('L', W(-0.18, y, z, v3), { dir: p.dir(0, 0.2, 1, v2), palm: DOWN, rate: 20 });
            f.bow = 0.12 + 0.08 * Math.sin(u * Math.PI);
          });
          if (side > 0) c.sfx('loom', p.pos.x, p.pos.z, 0.35);
        }
        if (n % 9 === 8) {
          f.reach('R', null); f.reach('L', null);
          yield* p.tween(1.2, (u) => { f.bow = lerp(0.12, -0.02, u); });
          f.lookAt(v4.copy(p.pos).add(p.dir(-1.2, 0.6, 1.5, v5)));
          yield* p.wait(rnd(2.5, 4.5));
          f.lookAt(null);
        }
      }
    },
    listen: listen('weaver'),
  }, [pt(door('d'))]);
  weaver.chatty = 0.4;
  // 杏儿：坐在娘的织机旁的地上，手里玩着一团线，看娘织布
  k.byAct = function* (p) {
    const f = p.fig;
    yield* p.go(D_FRONT.by, 1.2);
    yield* p.sit(0, 'lap');
    p.rest = () => undefined;
    yield* p.forever((t) => {
      f.lookAt(weaver.here && weaver.act === 'weave' ? v1.copy(weaver.pos).setY(weaver.pos.y + 0.8) : null);
      f.reach('R', p.loc(-0.06 + 0.05 * Math.sin(t * 2.1), 0.32 + 0.04 * Math.sin(t * 3.3), 0.22, v2), { dir: p.dir(0.4, 0, 0.9, v3), rate: 8 });
      f.reach('L', p.loc(0.06 - 0.04 * Math.sin(t * 2.1), 0.3, 0.22, v4), { dir: p.dir(-0.4, 0, 0.9, v3), rate: 8 });
      f.bow = 0.12 + 0.05 * Math.sin(t * 0.4);
    });
  };
  k.tends.push(() => { if (!weaver.here || weaver.act !== 'weave') loom.obj.visible = false; });

  // ———————————————————————— 孙嫂（做豆腐） ————————————————————————
  {
    const quern = P.quern(), lamp = P.oilLamp(), load = P.tofuLoad(), beans = P.tray();
    quern.obj.visible = lamp.visible = load.visible = beans.visible = false;
    k.group.add(quern.obj);
    const sell: Array<[number, number]> = [pt(door('a')), pt(door('b')), pt(door('school')), pt(door('d')), pt(door('e'))];
    const tofu = add('tofu', 'tofu', {
      /** 推磨：右手攥着磨把一圈一圈地转，左手隔一阵往磨眼里添一把泡好的豆；天黑时磨架上点一盏灯 */
      *grind(p, c) {
        const f = p.fig, Q = E_FRONT.quern;
        setDown(p, quern.obj, Q);
        yield* p.go(E_FRONT.grind, 0.9);
        p.pose('stand'); p.curious = true;
        p.hold(lamp, 'world'); lamp.position.set(Q.x + Math.sin(Q.yaw + 1.2) * 0.3, footY(Q.x, Q.z) + 0.575, Q.z + Math.cos(Q.yaw + 1.2) * 0.3);
        p.rest = () => { f.reach('R', null); f.reach('L', null); };
        let a = 0, last = 0;
        yield* p.forever((t) => {
          lamp.visible = c.night > 0.25;
          a += p.dt * 2.2; quern.top.rotation.y = -a;
          quern.top.localToWorld(v1.set(0.21, 0.32, 0));
          f.reach('R', v1, { dir: p.dir(0, -0.6, 0.8, v2), palm: p.dir(1, 0, 0, v3), rate: 18 });
          const add2 = Math.max(0, Math.sin(t * 0.5)) ** 8;
          f.reach('L', add2 > 0.05 ? v4.lerpVectors(p.loc(0.3, 0.75, 0.45, v4), quern.obj.localToWorld(v5.set(0.08, 0.82, 0)), add2) : null, { dir: DOWN, rate: 8 });
          f.bow = 0.22 + 0.06 * Math.sin(a);
          if (Math.floor(a / 6.283) !== last) { last = Math.floor(a / 6.283); c.sfx('millstone', p.pos.x, p.pos.z, 0.3); }
        });
      },
      /** 挑着豆腐担子挨家去：到门口放下，等一会儿（各家拿碗来端），挑起来去下一家 */
      *sell(p, c) {
        const f = p.fig;
        for (let i = 0; ; i++) {
          shoulder(p, load); p.rest = () => steadyPole(p);
          const d = sell[i % sell.length];
          yield* during(p.go({ x: d[0], z: d[1] }, 0.9), () => steadyPole(p));
          yield* p.tween(1.0, (u) => { f.bow = 0.5 * u; steadyPole(p); });
          setDown(p, load, p.loc(0, 0, 0.7, v1), 0.5); load.rotation.y = p.yaw + Math.PI / 2; f.reach('R', null);
          yield* p.tween(0.8, (u) => { f.bow = 0.5 * (1 - u); });
          p.pose('stand', 'sleeve');
          yield* p.wait(rnd(14, 24));
          p.pose('stand', 'free');
          yield* p.tween(1.0, (u) => { f.bow = 0.5 * u; });
          c.sfx('pole', p.pos.x, p.pos.z, 0.3);
          yield* p.tween(1.0, (u) => { f.bow = 0.5 * (1 - u); shoulder(p, load); steadyPole(p); });
        }
      },
      /** 午后坐在酒家凳上拣豆子 */
      *beans(p, c) {
        const f = p.fig;
        yield* p.bench(E_FRONT.beans, 0.9);
        p.hold(beans, 'L'); beans.position.set(0, 0.02, 0.05); beans.rotation.set(-Math.PI / 2, 0, 0);
        p.rest = () => f.reach('R', null);
        for (let t = 0; ; t += p.dt) {
          pickWork(p, t);
          f.lookAt(p.loc(0.08, 0.45, 0.45, v3));
          if (Math.sin(t * 0.13) > 0.97) { const kp = k.who('keeper'); if (kp?.here) f.lookAt(v4.copy(kp.pos).setY(kp.pos.y + 1.4)); }
          if (t > 40 && c.fair) { t = 0; yield* p.wait(rnd(2, 4)); }
          yield;
        }
      },
      listen: listen('tofu'),
    }, [pt(door('e'))]);
    tofu.chatty = 0.6;
    k.tends.push((c) => { if (!tofu.here || tofu.act !== 'grind') { quern.obj.visible = false; } void c; });
  }

  // ———————————————————————— 陈篾匠（己家） ————————————————————————
  {
    const knife = P.basketWork().strip, small = P.basketWork(), stool = stoolOf();
    knife.visible = small.obj.visible = false;
    const bk = add('basketman', 'basketman', {
      /** 破篾、编筐：坐在小板凳上对着篾凳，左手捏住篾的一头，右手的篾刀顺着推过去；隔一阵起来蹲到半只筐边上编几道，或者到竿上晾篾 */
      *basket(p, c) {
        const f = p.fig;
        if (!c.fair) {
          // 雨天：檐下坐着，膝上一只小筐，两手一上一下地穿篾
          yield* sitStool(p, F_FRONT.eave, stool, 0.9);
          p.hold(small.obj, 'world'); small.obj.position.copy(p.loc(0, 0.32, 0.32, v1)); small.obj.scale.setScalar(0.6); small.obj.rotation.set(0, p.yaw, 0);
          p.rest = () => { f.reach('R', null); f.reach('L', null); };
          yield* p.forever((t) => {
            const a = t * 2.4;
            f.reach('R', p.loc(-0.12 + 0.06 * Math.cos(a), 0.5 + 0.05 * Math.sin(a * 2), 0.32 + 0.06 * Math.sin(a), v1), { dir: p.dir(0.5, -0.3, 0.8, v2), rate: 12 });
            f.reach('L', p.loc(0.12 - 0.06 * Math.cos(a), 0.5, 0.32 - 0.06 * Math.sin(a), v3), { dir: p.dir(-0.5, -0.3, 0.8, v2), rate: 12 });
            f.lookAt(p.loc(0, 0.42, 0.34, v4)); f.bow = 0.3;
          });
          return;
        }
        const benchY = () => footY(F_FRONT.bench.x, F_FRONT.bench.z) + 0.41;
        for (let n = 0; ; n++) {
          yield* p.bench(F_FRONT.seat, 0.9);
          p.hold(knife, 'R');
          p.rest = () => { f.reach('R', null); f.reach('L', null); };
          // 破篾：一下一下往前推
          for (let i = 0, N = 8 + (n % 3) * 2; i < N; i++) {
            yield* p.tween(1.1, (u) => {
              const l = p.loc(0.14, 0, 0.42, v1), r = p.loc(lerp(-0.02, -0.4, u), 0, 0.44, v3);
              l.y = r.y = benchY() + 0.03;
              f.reach('L', l, { dir: p.dir(0, -0.4, 1, v2), palm: DOWN, rate: 12 }); f.reach('R', r, { dir: p.dir(-0.2, -0.3, 1, v4), palm: DOWN, rate: 14 });
              f.bow = 0.4; f.lookAt(p.loc(-0.1, 0.4, 0.5, v5));
            });
            if (i % 2 === 0) c.sfx('split', p.pos.x, p.pos.z, 0.35);
            yield* p.tween(0.45, () => undefined);
          }
          f.reach('R', null); f.reach('L', null); f.lookAt(null); knife.visible = false;
          yield* p.wait(rnd(1.5, 3));
          if (n % 2 === 0) {
            // 蹲到半只筐边上编几道：两手绕着筐沿一上一下
            yield* p.go(F_FRONT.weave, 0.8);
            p.pose('crouch'); p.seated = true;
            const B = F_FRONT.basket, by = footY(B.x, B.z);
            for (let t = 0, T = rnd(14, 22); t < T; t += p.dt) {
              const a = t * 1.6;
              f.reach('R', v1.set(B.x + Math.cos(a) * 0.28, by + 0.18 + 0.04 * Math.sin(t * 6), B.z + Math.sin(a) * 0.28), { dir: DOWN, rate: 10 });
              f.reach('L', v3.set(B.x + Math.cos(a + 0.9) * 0.28, by + 0.16, B.z + Math.sin(a + 0.9) * 0.28), { dir: DOWN, rate: 10 });
              f.lookAt(v4.set(B.x, by + 0.15, B.z)); f.bow = 0.35;
              yield;
            }
            f.reach('R', null); f.reach('L', null); f.lookAt(null);
            p.pose('stand'); p.seated = false;
          } else {
            // 到竿上晾几绺篾
            yield* p.go(F_FRONT.rack, 0.8);
            for (let i = 0; i < 3; i++) {
              yield* p.tween(1.0, (u) => { f.reach('R', p.loc(-0.15 + 0.1 * i, lerp(1.0, 1.6, u), 0.4, v1), { dir: UPV, rate: 10 }); f.reach('L', p.loc(0.15 + 0.1 * i, lerp(1.0, 1.58, u), 0.4, v3), { dir: UPV, rate: 10 }); f.lookAt(p.loc(0, 1.6, 0.6, v4)); });
              yield* p.tween(0.8, (u) => { f.reach('R', p.loc(-0.15 + 0.1 * i, lerp(1.6, 1.0, u), 0.4, v1), { rate: 10 }); f.reach('L', p.loc(0.15 + 0.1 * i, lerp(1.58, 1.0, u), 0.4, v3), { rate: 10 }); });
            }
            f.reach('R', null); f.reach('L', null); f.lookAt(null);
          }
        }
      },
      listen: listen('basketman'),
    }, [pt(door('f'))]);
    bk.chatty = 0.25;
  }

  // ———————————————————————— 陶大（庚家） ————————————————————————
  {
    const fag = P.firewood(), pot = P.bowl(0.11);
    fag.visible = pot.visible = false;
    const potter = add('potter', 'potter', {
      /** 拉坯：坐在轮边的矮凳上，两手拢着轮上的泥，一点一点往上提；隔一阵弯腰拿棍拨一拨轮子 */
      *throw(p, c) {
        const f = p.fig, W = G_WORK.wheel, wy = G_WORK.wheelY;
        yield* p.bench(G_WORK.seat, 0.9);
        p.curious = false;
        p.rest = () => { f.reach('R', null); f.reach('L', null); };
        for (;;) {
          for (let t = 0, T = rnd(18, 30); t < T; t += p.dt) {
            const up = 0.5 - 0.5 * Math.cos(t * 0.5), wob = 0.012 * Math.sin(t * 9);
            const s = Math.sin(p.yaw), co = Math.cos(p.yaw), side = (d: number) => [co * d, -s * d];
            const [ax, az] = side(0.07);
            f.reach('R', v1.set(W.x - ax - s * 0.06 + wob, wy + 0.1 + 0.2 * up, W.z - az - co * 0.06), { dir: p.dir(0.6, -0.2, 0.8, v2), palm: p.dir(1, 0, 0, v3), rate: 10 });
            f.reach('L', v4.set(W.x + ax - s * 0.06 - wob, wy + 0.1 + 0.2 * up, W.z + az - co * 0.06), { dir: p.dir(-0.6, -0.2, 0.8, v2), palm: p.dir(-1, 0, 0, v5), rate: 10 });
            f.lookAt(v5.set(W.x, wy + 0.2, W.z)); f.bow = 0.42 - 0.1 * up;
            yield;
          }
          // 拨轮子
          f.reach('L', null);
          yield* p.tween(1.4, (u) => { f.bow = 0.5; f.reach('R', v1.set(W.x - Math.sin(p.yaw) * 0.05 + Math.cos(u * 3) * 0.4, wy + 0.02, W.z + Math.sin(u * 3) * 0.4), { dir: DOWN, rate: 10 }); });
          c.sfx('wood', W.x, W.z, 0.12);
          f.reach('R', null);
          yield* p.wait(rnd(1, 2));
        }
      },
      /** 烧窑：去窑西的柴垛抱一捆柴，到窑门前蹲下塞进去，看一会儿火；添两回柴，进棚捧一只坯摆到屋前的架上 */
      *kiln(p, c) {
        const f = p.fig;
        for (let n = 0; ; n++) {
          for (let i = 0; i < 2; i++) {
            yield* p.go(G_WORK.kilnWood, 0.95);
            yield* p.tween(1.0, (u) => { f.bow = 0.7 * u; });
            p.hold(fag, 'chest'); fag.position.set(0, -0.15, 0.32); fag.rotation.set(0, 0, 0); fag.scale.setScalar(0.45);
            const hold = () => { f.reach('R', p.loc(-0.18, 1.0, 0.32, v1), { dir: p.dir(0.3, 0.2, 1, v2), palm: UPV, rate: 12 }); f.reach('L', p.loc(0.18, 1.0, 0.32, v3), { dir: p.dir(-0.3, 0.2, 1, v2), palm: UPV, rate: 12 }); };
            p.rest = hold;
            yield* p.tween(1.0, (u) => { f.bow = 0.7 * (1 - u); hold(); });
            yield* during(p.go(G_WORK.kiln, 0.85), hold);
            p.pose('crouch'); p.seated = true;
            yield* p.tween(1.2, (u) => { const m = G_WORK.kilnMouth; f.reach('R', v1.lerpVectors(p.loc(-0.15, 0.6, 0.4, v1), v4.set(m.x, footY(m.x, m.z) + 0.35, m.z), u), { dir: p.dir(0, -0.2, 1, v2), rate: 10 }); f.reach('L', v3.copy(v1).add(p.dir(0.3, 0, 0, v5)), { dir: p.dir(0, -0.2, 1, v2), rate: 10 }); });
            fag.visible = false; c.sfx('wood', p.pos.x, p.pos.z, 0.2);
            f.reach('R', null); f.reach('L', null); p.rest = null;
            for (let t = 0, T = rnd(5, 8); t < T; t += p.dt) { f.lookAt(v1.set(G_WORK.kilnMouth.x, footY(G_WORK.kilnMouth.x, G_WORK.kilnMouth.z) + 0.4, G_WORK.kilnMouth.z)); yield; }
            f.lookAt(null);
            p.pose('stand'); p.seated = false;
          }
          // 摆坯：从棚里捧一只出来放到架上
          yield* p.go({ x: G_WORK.shed.x + Math.sin(G_WORK.shed.yaw) * 1.6, z: G_WORK.shed.z + Math.cos(G_WORK.shed.yaw) * 1.6, yaw: G_WORK.shed.yaw + Math.PI }, 0.9);
          yield* p.tween(0.9, (u) => { f.bow = 0.5 * u; });
          p.hold(pot, 'world');
          const carry = () => { const h = p.loc(0, 0.95, 0.3, v1); pot.position.set(h.x, h.y - 0.05, h.z); f.reach('R', v3.copy(h).add(p.dir(-0.1, 0, 0, v4)), { dir: p.dir(0.4, 0, 1, v2), palm: p.dir(1, 0.2, 0, v5), rate: 12 }); f.reach('L', v3.copy(h).add(p.dir(0.1, 0, 0, v4)), { dir: p.dir(-0.4, 0, 1, v2), palm: p.dir(-1, 0.2, 0, v5), rate: 12 }); };
          yield* p.tween(0.9, (u) => { f.bow = 0.5 * (1 - u); carry(); });
          yield* during(p.go(G_WORK.racks[n % 2], 0.8), carry);
          yield* p.tween(1.0, (u) => { f.bow = 0.35 * u; carry(); });
          pot.visible = false; f.reach('R', null); f.reach('L', null);
          yield* p.tween(0.8, (u) => { f.bow = 0.35 * (1 - u); });
          yield* p.wait(rnd(1, 3));
        }
      },
      /** 冬天歇窑：在棚里揉泥，两手按着往前推、卷回来 */
      *clay(p) {
        const f = p.fig;
        yield* p.go(G_WORK.clay, 0.9);
        p.pose('stand');
        p.rest = () => { f.reach('R', null); f.reach('L', null); };
        yield* p.forever((t) => {
          const u = 0.5 - 0.5 * Math.cos(t * 1.8);
          f.reach('R', p.loc(-0.1, lerp(0.62, 0.52, u), lerp(0.35, 0.55, u), v1), { dir: p.dir(0, -0.7, 0.7, v2), palm: DOWN, rate: 12 });
          f.reach('L', p.loc(0.1, lerp(0.62, 0.52, u), lerp(0.35, 0.55, u), v3), { dir: p.dir(0, -0.7, 0.7, v2), palm: DOWN, rate: 12 });
          f.bow = 0.35 + 0.15 * u; f.lookAt(p.loc(0, 0.5, 0.5, v4));
        });
      },
      listen: listen('potter'),
    }, [pt(door('g'))]);
    potter.chatty = 0.3;
  }

  // ———————————————————————— 孟老（药农） ————————————————————————
  {
    const back = P.backBasket(), hoe = P.herbHoe(), trays = [P.herbTray(3), P.herbTray(7), P.herbTray(11)];
    back.visible = hoe.visible = false; for (const t of trays) t.visible = false;
    let hs = 0;
    const herbalist = add('herbalist', 'herbalist', {
      /** 刨药：背着篓、提着药锄上山坡，一处一处蹲下刨，刨出来抖抖土，反手扔进背篓 */
      *herb(p, c) {
        const f = p.fig;
        p.hold(back, 'chest'); back.position.set(0, 0.14, -0.13); back.rotation.set(0, 0, 0);
        for (;;) {
          const [x, z] = HERB_SPOTS[hs++ % HERB_SPOTS.length];
          p.hold(hoe, 'R');
          yield* p.go({ x: x + rnd(-1, 1), z: z + rnd(-1, 1), yaw: rnd(-3, 3) }, 0.8);
          p.pose('crouch'); p.seated = true;
          p.rest = () => { f.reach('R', null); f.reach('L', null); };
          for (let i = 0; i < 4; i++) {
            yield* p.tween(0.55, (u) => f.reach('R', p.loc(-0.1, lerp(0.25, 0.55, u), 0.4, v1), { dir: p.dir(0, 0.7, 0.7, v2), rate: 12 }));
            yield* p.tween(0.2, (u) => f.reach('R', p.loc(-0.1, lerp(0.55, 0.12, u), lerp(0.4, 0.5, u), v1), { dir: p.dir(0, -0.5, 0.85, v2), rate: 30 }));
            c.sfx('dig', p.pos.x, p.pos.z, 0.3);
            yield* p.wait(0.35);
          }
          // 拔出来、抖一抖、反手扔进背篓
          yield* p.tween(0.8, (u) => f.reach('L', p.loc(0.05, lerp(0.15, 0.5, u), 0.45, v3), { dir: DOWN, rate: 10 }));
          for (let t = 0; t < 0.8; t += p.dt) { f.reach('L', p.loc(0.05 + 0.04 * Math.sin(t * 30), 0.5, 0.45, v3), { dir: DOWN, rate: 30 }); yield; }
          yield* p.tween(0.9, (u) => f.reach('L', p.loc(lerp(0.05, 0.15, u), lerp(0.5, 1.35, u), lerp(0.45, -0.1, u), v3), { dir: UPV, rate: 10 }));
          f.reach('L', null); f.reach('R', null);
          p.pose('stand'); p.seated = false;
          yield* p.wait(rnd(1, 2.5));
        }
      },
      /** 晒药：茶亭西边的空地上摊开三只药匾，蹲在匾边用手翻一翻、拣一拣，一只一只挨着来 */
      *dry(p) {
        const f = p.fig;
        trays.forEach((t, i) => setDown(p, t, TEA_MORE.herbs[i], 0.0));
        for (let n = 0; ; n++) {
          const T = TEA_MORE.herbs[n % 3], s = { x: T.x + 0.75, z: T.z, yaw: -Math.PI / 2 };
          yield* p.go(s, 0.8);
          p.pose('crouch'); p.seated = true;
          p.rest = () => { f.reach('R', null); f.reach('L', null); };
          const ty = footY(T.x, T.z) + 0.05;
          for (let t = 0, D = rnd(10, 16); t < D; t += p.dt) {
            f.reach('R', v1.set(T.x + 0.1 * Math.sin(t * 1.3), ty, T.z - 0.18 + 0.14 * Math.sin(t * 2.1)), { dir: DOWN, palm: DOWN, rate: 8 });
            f.reach('L', v3.set(T.x + 0.1 * Math.cos(t * 1.1), ty, T.z + 0.18 + 0.12 * Math.sin(t * 1.7 + 1)), { dir: DOWN, palm: DOWN, rate: 8 });
            f.lookAt(v4.set(T.x, ty, T.z)); f.bow = 0.38;
            yield;
          }
          f.reach('R', null); f.reach('L', null); f.lookAt(null);
          p.pose('stand'); p.seated = false;
          yield* p.wait(rnd(2, 5));
        }
      },
    }, [[86, -45]]);
    herbalist.chatty = 0.15;
  }

  // ———————————————————————— 冯老汉（放羊） ————————————————————————
  {
    const whip = P.herdWhip();
    whip.visible = false;
    let bi = 0;
    const carryWhip = (p: Person) => p.fig.reach('R', p.loc(-0.22, 0.95, 0.22, v1), { dir: p.dir(0.1, 1, 0.2, v2), rate: 10 });
    const shepherd = add('shepherd', 'shepherd', {
      /** 赶羊：羊群跟着他走（fauna 的 sheep.follow），他慢慢地在河滩上换地方，站下来拄着鞭杆看羊吃草，隔一阵把鞭子一甩 */
      *sheep(p, c) {
        const f = p.fig, S = FAUNA.sheep;
        p.hold(whip, 'R');
        if (S) {
          S.manual = true;
          // 清早先到丁家屋东头的羊圈，把羊放出来
          if (!p.snap) { yield* during(p.go({ x: S.home.x + 1.2, z: S.home.z + 1.6 }, 0.85), () => carryWhip(p)); yield* p.wait(1.5); }
          S.out(); S.follow(p);
        }
        p.leave = function* (): Script {
          if (S) S.follow(p);
          const h = S ? { x: S.home.x + 1.2, z: S.home.z + 1.6 } : { x: k.EAST[0], z: k.EAST[1] };
          yield* during(p.go(h, 0.75), () => carryWhip(p));
          if (S) { S.pen(); yield* p.wait(3); S.manual = false; yield* during(p.go({ x: k.EAST[0], z: k.EAST[1] }, 0.9), () => carryWhip(p)); }
          p.vanish();
        };
        for (;;) {
          const [x, z] = MEADOW[bi++ % MEADOW.length];
          yield* during(p.go({ x: x + rnd(-2, 2), z: z + rnd(-2, 2) }, 0.6), () => carryWhip(p));
          // 站下来：拄着鞭杆，看羊
          for (let t = 0, T = rnd(16, 30); t < T; t += p.dt) {
            f.reach('R', p.loc(-0.25, 0.8, 0.28, v1), { dir: p.dir(0.1, 1, 0.3, v2), rate: 6 });
            f.lookAt(S ? v3.copy(S.center).setY(p.pos.y + 0.4) : null); f.bow = 0.1;
            yield;
          }
          if (k.R() < 0.5) {
            // 甩一鞭：举起来往前一抖
            yield* p.tween(0.6, (u) => f.reach('R', p.loc(-0.3, lerp(0.95, 1.5, u), lerp(0.2, -0.05, u), v1), { dir: p.dir(0, 1, -0.4, v2), rate: 16 }));
            yield* p.tween(0.25, (u) => f.reach('R', p.loc(-0.3, lerp(1.5, 1.2, u), lerp(-0.05, 0.5, u), v1), { dir: p.dir(0, 0.4, 1, v2), rate: 30 }));
            c.sfx('whip', p.pos.x, p.pos.z, 0.4);
            yield* p.wait(0.6);
          }
        }
      },
      /** 晌午：坐在柳树下，鞭子横在膝上，羊在跟前散着吃草、卧着 */
      *sheepRest(p) {
        const S = FAUNA.sheep;
        if (S) { S.manual = true; S.follow(p); }
        // 背朝着树坐下（头靠着树荫那边），坐一会儿就仰面躺下打个盹；鞭子撂在身边，羊在跟前散着吃草、卧着
        yield* p.go({ x: RESTTREE.x, z: RESTTREE.z, yaw: RESTTREE.yaw + Math.PI }, 0.7);
        setDown(p, whip, p.loc(0.55, 0, 0.1, v1), 0.02); whip.rotation.set(Math.PI / 2, p.yaw + 0.3, 0);
        yield* p.sit(0, 'lap');
        if (S) { S.follow(null); S.graze(p.pos.x + Math.sin(p.yaw) * 4, p.pos.z + Math.cos(p.yaw) * 4, 6); }
        yield* p.wait(k.rnd(15, 30));
        p.pose('lie', 'lap'); p.seated = true; p.curious = false;
        yield* p.forever(() => undefined);
      },
    }, [k.EAST]);
    shepherd.chatty = 0.2;
    k.tends.push(() => { const S = FAUNA.sheep; if (S && S.manual && !shepherd.present) { S.manual = false; S.follow(null); } });
  }

  // ———————————————————————— 李二（打更的） ————————————————————————
  {
    const lantern = P.lantern(), clap = P.clapper(), stick = P.beatStick(0.24), bowl = P.bowl(0.05);
    lantern.visible = clap.visible = stick.visible = bowl.visible = false;
    const watchman = add('watchman', 'watchman', {
      /** 打更：灯笼挂在腰间，左手托着梆子、右手攥着棍，沿着各家门前绕村走；到一处站下敲几下 */
      *watch(p, c) {
        const f = p.fig;
        p.hold(lantern, 'root'); p.hold(clap, 'L'); p.hold(stick, 'R');
        const hold = (strike: number) => {
          f.reach('L', p.loc(0.08, 1.02, 0.3, v1), { dir: p.dir(0.2, 1, 0.2, v2), palm: p.dir(-1, 0, 0, v3), rate: 12 });
          f.reach('R', p.loc(-0.06, 1.12 + 0.12 * strike, 0.34, v4), { dir: p.dir(0.6, 0.3 - 0.7 * strike, 0.7, v2), rate: 22 });
        };
        const swing = (t: number) => { lantern.position.set(-0.27, 0.92, 0.08); lantern.rotation.set(Math.PI + 0.12 * Math.sin(t * 4.2) * Math.min(1, p.walking ? 1 : 0.2), 0, 0.08 * Math.sin(t * 3.1)); };
        p.rest = () => hold(0);
        // 从离得最近的那一处接着绕
        let i = 0, bd = 1e9;
        ROUND.forEach(([x, z], j) => { const d = Math.hypot(x - p.pos.x, z - p.pos.z); if (d < bd) { bd = d; i = j; } });
        for (let t = 0; ; i++) {
          const [x, z] = ROUND[i % ROUND.length];
          yield* during(p.go({ x, z }, 0.85), () => { t += p.dt; hold(0); swing(t); });
          // 敲：梆——梆——梆
          for (let n = 0; n < 3; n++) {
            yield* p.tween(0.35, (u) => { t += p.dt; hold(u); swing(t); });
            if (n === 0) c.sfx('clapper', p.pos.x, p.pos.z, 0.6);
            yield* p.tween(0.12, (u) => { t += p.dt; hold(1 - u); swing(t); });
            yield* p.wait(0.4);
          }
          yield* p.wait(rnd(1, 2.5));
        }
      },
      /** 午后：坐在茶亭板凳的东头，靠着柱子打盹，醒了喝口茶 */
      *teaShed(p, c) {
        const f = p.fig;
        yield* p.bench(TEA_MORE.seat2, 0.8, [pt(TEA.inn)]);
        p.hold(bowl, 'L');
        p.rest = () => f.reach('L', null);
        for (;;) {
          const T = rnd(12, 22);
          for (let t = 0; t < T; t += p.dt) { f.bow = 0.05 + 0.4 * Math.min(1, t / T) ** 1.5; f.reach('L', p.loc(0.12, 0.5, 0.3, v1), { dir: p.dir(-0.3, 0.2, 1, v2), palm: UPV, rate: 6 }); yield; }
          yield* p.tween(0.6, (u) => { f.bow = lerp(f.bow, 0.03, u); });
          yield* p.tween(1.2, () => f.reach('L', f.joints.head.getWorldPosition(v3).add(p.dir(0, -0.07, 0.1, v4)), { dir: p.dir(-0.7, 0.55, 0, v5), palm: UPV, rate: 5 }));
          c.sfx('cup', p.pos.x, p.pos.z, 0.25);
          yield* p.wait(1.2);
        }
      },
    }, [pt(door('b'))]);
    watchman.chatty = 0.35;
  }

  // ———————————————————————— 韩翁（说书的盲翁） ————————————————————————
  {
    const drum = P.storyDrum(), seat = P.foldStool(), staff = P.staff(1.25), stick = P.beatStick(0.28), post = P.lanternPost();
    drum.visible = seat.visible = staff.visible = stick.visible = post.obj.visible = false;
    const S = k.story, EAST = k.EAST;
    const teller = add('teller', 'teller', {
      /** 说书：拄着杖自东头沿村路摸着走来，支起交床与鼓，坐下先敲一通鼓；说起来两手比划，头随着说的人一左一右地转；抖包袱时拍一下醒木 */
      *tell(p, c) {
        const f = p.fig;
        S.on = false;
        p.leave = function* (): Script {
          S.on = false;
          f.reach('R', null); f.reach('L', null); f.lookAt(null);
          drum.visible = seat.visible = post.obj.visible = false;
          p.hold(staff, 'R');
          yield* during(p.go({ x: EAST[0], z: EAST[1] }, 0.6), () => f.reach('R', p.loc(-0.22, 0.75, 0.42, v1), { dir: p.dir(0, -0.5, 0.86, v2), rate: 8 }));
          p.vanish();
        };
        if (!p.snap) {
          p.place({ x: EAST[0], z: EAST[1], yaw: -Math.PI / 2 }); p.snap = false;
          p.hold(staff, 'R');
          // 杖在身前一点一点地探
          yield* during(p.go({ x: STORY.teller.x + Math.sin(STORY.teller.yaw) * 0.9, z: STORY.teller.z + Math.cos(STORY.teller.yaw) * 0.9 }, 0.55), () => f.reach('R', p.loc(-0.2, 0.72 + 0.04 * Math.sin(p.c.t * 4), 0.45, v1), { dir: p.dir(0, -0.55, 0.84, v2), rate: 8 }));
          staff.visible = false; f.reach('R', null);
        }
        setDown(p, seat, STORY.stool); setDown(p, drum, STORY.drum);
        // 天擦黑了在身后插一根灯竿
        { const T = STORY.teller, co = Math.cos(T.yaw), sn = Math.sin(T.yaw); setDown(p, post.obj, { x: T.x + 0.75 * co - 0.55 * sn, z: T.z - 0.75 * sn - 0.55 * co, yaw: T.yaw + 0.4 }); }
        yield* p.bench(STORY.seat, 0.6);
        p.hold(stick, 'R'); p.curious = false;
        const top = () => v5.set(STORY.drum.x, footY(STORY.drum.x, STORY.drum.z) + 0.67, STORY.drum.z);
        const head = () => { post.lamp.visible = c.night > 0.15; return f.joints.head.getWorldPosition(S.head); };
        p.rest = () => { f.reach('R', null); f.reach('L', null); };
        for (let round = 0; ; round++) {
          // 一通鼓
          S.on = false;
          for (let n = 0; n < 7; n++) {
            yield* p.tween(0.28, (u) => { f.reach('R', top().add(v4.set(0, 0.25 * u, 0)), { dir: p.dir(0.3, -0.3, 0.9, v2), rate: 24 }); head(); });
            yield* p.tween(0.12, (u) => { f.reach('R', top().add(v4.set(0, 0.25 * (1 - u) + 0.02, 0)), { dir: p.dir(0.3, -0.6, 0.7, v2), rate: 30 }); head(); });
            c.sfx(n % 3 === 2 ? 'drumrim' : 'drum', STORY.drum.x, STORY.drum.z, 0.22);
          }
          S.on = true;
          // 说：一段二三十秒，末了抖个包袱
          for (let seg = 0; seg < 4; seg++) {
            let talk = 0;
            for (let t = 0, T = rnd(18, 32); t < T; t += p.dt) {
              const g = Math.sin(t * 1.3) * 0.5 + 0.5, h = Math.sin(t * 0.37 + seg);
              f.reach('L', p.loc(0.22 + 0.12 * g, 0.75 + 0.15 * Math.sin(t * 2.1), 0.32 + 0.1 * g, v1), { dir: p.dir(-0.2, 0.6, 0.7, v2), palm: p.dir(0.3, 0.6, 0.6, v3), rate: 5 });
              f.reach('R', p.loc(-0.22 - 0.06 * g, 0.62 + 0.06 * Math.sin(t * 1.7), 0.34, v4), { dir: p.dir(0.2, 0.3, 0.9, v2), rate: 5 });
              f.lookAt(p.loc(1.6 * h, 1.0 + 0.1 * Math.sin(t * 0.9), 2.2, v3));
              f.bow = 0.06 + 0.06 * Math.sin(t * 0.8);
              if ((talk -= p.dt) < 0) { talk = rnd(11, 19); c.sfx('murmur', p.pos.x, p.pos.z, 0.22); }
              head();
              yield;
            }
            // 包袱：一拍醒木（右手的棍往鼓沿上一敲），满场一笑
            yield* p.tween(0.3, (u) => { f.reach('R', top().add(v4.set(0.12, 0.2 * u, 0)), { dir: p.dir(0.3, -0.3, 0.9, v2), rate: 24 }); head(); });
            yield* p.tween(0.1, () => { f.reach('R', top().add(v4.set(0.12, 0.02, 0)), { dir: p.dir(0.3, -0.6, 0.7, v2), rate: 30 }); head(); });
            c.sfx('wood', STORY.drum.x, STORY.drum.z, 0.45);
            S.beat++;
            yield* p.tween(1.5, () => { f.lookAt(p.loc(0, 1.2, 2, v3)); f.bow = 0.02; head(); });
          }
        }
      },
    }, [EAST]);
    teller.chatty = 0;
    S.head.set(STORY.teller.x, footY(STORY.teller.x, STORY.teller.z) + 1.2, STORY.teller.z);
    k.tends.push(() => { if (!teller.here || teller.act !== 'tell') S.on = false; });
  }

  // ———————————————————————— 了然（行脚僧） ————————————————————————
  {
    const staff = P.monkStaff(1.75), cup = P.bowl(0.05);
    staff.visible = cup.visible = false;
    const WEST = k.WEST, EAST = k.EAST;
    const plant = (p: Person) => { p.hold(staff, 'R'); staff.position.set(0, 1.0, 0); staff.rotation.set(Math.PI, 0, 0); };
    const walkPose = (p: Person) => p.fig.reach('R', p.loc(-0.24, 1.0, 0.18 + 0.05 * Math.sin(p.c.t * 3.6), v1), { dir: DOWN, palm: p.dir(1, 0, 0, v2), rate: 10 });
    const monk = add('monk', 'monk', {
      /** 过路：拄着锡杖自西边沿桃林的路来，到茶亭前合十一礼，舀一碗茶喝了，坐下歇一会儿，起身再合十，往东去了 */
      *pass(p, c) {
        const f = p.fig;
        const away = function* (): Script {
          plant(p);
          yield* during(p.go({ x: EAST[0], z: EAST[1] }, 0.85), () => walkPose(p));
          yield* p.away(1e5);
        };
        p.leave = function* (): Script { yield* away(); p.vanish(); };
        if (!p.snap) {
          p.place({ x: WEST[0], z: WEST[1], yaw: Math.PI / 2 }); p.snap = false;
          plant(p);
          yield* during(p.go(TEA.stand, 0.85), () => walkPose(p));
        }
        // 合十一礼
        staff.visible = false; f.reach('R', null);
        yield* p.go(TEA_MORE.jar, 0.7, [pt(TEA.inn)], true);
        p.pose('stand', 'pray');
        yield* p.tween(1.2, (u) => { f.bow = 0.4 * Math.sin(u * Math.PI); });
        p.pose('stand', 'free');
        // 舀一碗茶喝
        p.hold(cup, 'R');
        yield* p.tween(1.0, () => f.reach('R', v1.set(TEA_MORE.jarTop.x, TEA_MORE.jarTop.y, TEA_MORE.jarTop.z), { dir: DOWN, rate: 8 }));
        yield* p.tween(1.2, () => f.reach('R', f.joints.head.getWorldPosition(v1).add(p.dir(-0.02, -0.08, 0.11, v2)), { dir: p.dir(0.7, 0.55, 0, v3), palm: UPV, rate: 6 }));
        c.sfx('cup', p.pos.x, p.pos.z, 0.25);
        yield* p.wait(1.5);
        cup.visible = false; f.reach('R', null);
        // 坐一会儿
        yield* p.bench(TEA.seat, 0.7, undefined, 'lap');
        for (let t = 0, T = rnd(40, 70); t < T; t += p.dt) { f.bow = 0.12; yield; }
        p.pose('stand', 'pray');
        yield* p.tween(1.2, (u) => { f.bow = 0.35 * Math.sin(u * Math.PI); });
        p.pose('stand', 'free');
        yield* away();
      },
    }, [WEST]);
    monk.greetBy = 'pray'; monk.chatty = 0;
  }

  // ———————————————————————— 刘二姐（王大娘的妹子） ————————————————————————
  {
    const basket = P.foodBasket(), stool = stoolOf();
    basket.visible = false;
    const EAST = k.EAST;
    const aunt = add('aunt', 'aunt', {
      /** 来串门：挎着一篮鸡蛋从东边来，到王家门前把篮子递给姐姐（放在姐姐脚边），坐下说话；时候到了起身往回走 */
      *visit(p, c) {
        const f = p.fig, s = A_FRONT.chat[1];
        const carry = () => f.reach('L', p.loc(0.2, 0.92, 0.2, v5), { dir: DOWN, palm: p.dir(-1, 0, 0.2, v4), rate: 16 });
        p.leave = function* (): Script {
          f.reach('R', null); f.lookAt(null);
          p.pose('stand'); p.fig.setSeat(null);
          yield* p.tween(1.0, (u) => { f.bow = 0.3 * Math.sin(u * Math.PI); });
          yield* p.go({ x: EAST[0], z: EAST[1] }, 1.0);
          p.vanish();
        };
        if (!p.snap) {
          p.place({ x: EAST[0], z: EAST[1], yaw: -Math.PI / 2 }); p.snap = false;
          p.hold(basket, 'L');
          yield* during(p.go({ x: s.x + Math.sin(s.yaw) * 0.6, z: s.z + Math.cos(s.yaw) * 0.6 }, 1.0), carry);
          // 递篮子：俯身放在姐姐脚边
          yield* p.tween(1.1, (u) => { f.bow = 0.5 * u; carry(); });
          setDown(p, basket, { x: (A_FRONT.chat[0].x + s.x) / 2, z: (A_FRONT.chat[0].z + s.z) / 2 + 0.3 }, 0.4); basket.rotation.set(Math.PI, 0.5, 0);
          f.reach('L', null);
          yield* p.tween(1.0, (u) => { f.bow = 0.5 * (1 - u); });
        } else { setDown(p, basket, { x: (A_FRONT.chat[0].x + s.x) / 2, z: (A_FRONT.chat[0].z + s.z) / 2 + 0.3 }, 0.4); basket.rotation.set(Math.PI, 0.5, 0); }
        yield* sitStool(p, s, stool, 0.9);
        yield* chatWith(k, p, () => k.who('farmwife'), false);
      },
    }, [EAST]);
    aunt.chatty = 0.8;
  }
}
