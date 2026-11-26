/**
 * 骑牛、骑驴的器物：
 *   牛 —— 就是王伯家那头黄牛（life/ox.ts 的 OxTeam，同一个样子）。你骑着的那一头是另一份，照着村里那一头的样子、位置、朝向换上去，
 *     村里那一头这时藏起来；你下来以后它在原地吃一会儿草，再慢慢走回去，走到村里那一头在的地方再换回来（看起来一直是同一头牛）。
 *   驴 —— 碓房东头拴着的那头灰驴（life/fauna/donkey.ts 的几块，同一个样子），背上添一副鞍鞯、一根缰；换上、换回的办法与牛一样，
 *     拴驴的木桩在它被骑走时照旧立在那里。
 *   人横坐在背上（侧身骑，牧童骑牛、妇人骑驴都是这样）：两腿垂在左边，身子坐直，随着牲口的步子轻轻起落、微微晃。
 *   同游的人骑着牛、驴：那边只报他的身子在哪，这边在他身下照样画一头（registerRemoteProp），步子按他走得多快。
 *   绕村一圈的几处：牛棚、井、大槐树、村塾、碓房、洗衣埠、土地庙。
 */
import * as THREE from 'three';
import { box, cylUp, merge } from '../core/geo';
import { OxTeam } from '../life/ox';
import { DONKEY, donkeyGeo } from '../life/fauna/donkey';
import { Quad } from '../life/fauna/quad';
import { Parts, child, creatureMat, paint, span, tone, trs } from '../life/rig';
import { footY } from '../life/spots';
import type { Mark } from './games/lap';
import type { RemotePropKind } from '../net/props';

/** 坐凳的样子：凳面比脚高多少、凳心在脚后多远（avatar 的 bench）；人的 root 离背脊正中多远（两腿垂在外边） */
export const SEAT = { h: 0.44, cz: -0.34, out: 0.36 };
/** 两样牲口：背上坐处离地多高、走与快走多快（米/秒）、转身最快多快（弧度/秒）、身长的一半与身宽的一半（挡路用） */
export const MOUNT = {
  ox: { name: '牛', back: 1.27, walk: 1.0, brisk: 1.45, turn: 0.85, half: 0.6, r: 0.3, stride: 1.5 },
  donkey: { name: '驴', back: 1.13, walk: 1.15, brisk: 2.0, turn: 1.25, half: 0.4, r: 0.24, stride: 1.3 },
} as const;
export type MountKind = keyof typeof MOUNT;

/** 绕村一圈的几处（顺着走是：牛棚 → 井 → 大槐树 → 村塾 → 碓房 → 洗衣埠 → 土地庙 → 牛棚） */
export const RING: Mark[] = [
  { id: 'shed', name: '牛棚', x: 45.8, z: 4.4, r: 4.5 },
  { id: 'well', name: '井', x: 66.4, z: 18.8, r: 4.5 },
  { id: 'elm', name: '大槐树', x: 88.0, z: 11.6, r: 4.5 },
  { id: 'school', name: '村塾', x: 99.2, z: 8.8, r: 4.5 },
  { id: 'mill', name: '碓房', x: 104.4, z: 37.5, r: 4.5 },
  { id: 'wash', name: '洗衣埠', x: 47.6, z: 47.5, r: 4.5 },
  { id: 'shrine', name: '土地庙', x: 41.6, z: 21.8, r: 4.5 },
];

// —— 驴（骑的那一份）：灰驴的几块，再加鞍鞯、缰、木桩 ——
const WOOD = tone([0.78, 0.66, 0.54], 1.7), ROPE = tone([0.86, 0.79, 0.64], 1.5), CLOTH = tone([0.62, 0.66, 0.76], 1.9), PAD = tone([0.9, 0.84, 0.7], 1.4);
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4();
export class MountDonkey {
  parts: Parts; q: Quad;
  private k: { saddle: number; rein: number; post: number };
  /** 背上鞍面正中（世界坐标，place 之后有效） */
  seat = new THREE.Vector3();
  /** 笼头下巴那一点（拉缰的手往那里去） */
  bit = new THREE.Vector3();
  constructor(name = 'games:donkey') {
    const P = (this.parts = new Parts(creatureMat({ body: 0.15, shade: 1.5 }), name));
    this.q = new Quad(P, donkeyGeo(), DONKEY.D);
    // 鞍鞯：一块垫子（青布镶边）上一副木鞍架
    const saddle = merge([
      paint(box(0.4, 0.035, 0.44), CLOTH).translate(0, 0.205, 0.02),
      paint(box(0.32, 0.03, 0.34), PAD).translate(0, 0.235, 0.02),
      paint(box(0.05, 0.06, 0.05), WOOD).translate(0, 0.27, 0.17), paint(box(0.05, 0.05, 0.05), WOOD).translate(0, 0.265, -0.13),
      // 两边垂下的镫绳与镫（横坐时不踩，只是挂着）
      ...[-1, 1].map((s) => paint(box(0.012, 0.32, 0.012), ROPE).translate(s * 0.2, 0.06, 0.04)),
    ]);
    const rein = paint(cylUp(0.008, 0.008, 1, 4), ROPE);
    const post = merge([paint(cylUp(0.045, 0.055, 0.85, 7), WOOD), paint(cylUp(0.05, 0.05, 0.04, 7).translate(0, 0.76, 0), ROPE)]);
    this.k = { saddle: P.add(saddle), rein: P.add(rein), post: P.add(post) };
    P.build();
    this.q.snap(DONKEY.STAND);
    this.q.hide(); P.hide(this.k.saddle); P.hide(this.k.rein); P.hide(this.k.post); P.commit();
  }
  /** 摆：gy 脚下地面高（不给就按脚下的地）；hand 给了是牵缰的手（缰从笼头到手）；post 给了是拴驴桩在哪 */
  place(dt: number, t: number, o: { gy?: number; hand?: THREE.Vector3 | null; post?: { x: number; z: number } | null; saddle?: boolean } = {}) {
    const q = this.q, P = this.parts;
    const gy = o.gy ?? footY(q.x, q.z);
    const body = q.place(gy, dt, t, MOUNT.donkey.stride);
    if (o.saddle !== false) { P.place(this.k.saddle, child(_m, body, 0, 0, 0)); }
    else P.hide(this.k.saddle);
    this.seat.set(0, 0.26, 0.02).applyMatrix4(body);
    child(_n, body, 0, DONKEY.D.neck[0], DONKEY.D.neck[1], q.cur.ny + q.lookYaw, q.cur.np, q.cur.nr);
    this.bit.set(0, 0.1, 0.42).applyMatrix4(_n);
    if (o.hand) P.place(this.k.rein, span(_m, this.bit.x, this.bit.y, this.bit.z, o.hand.x, o.hand.y, o.hand.z)); else P.hide(this.k.rein);
    if (o.post) { const py = footY(o.post.x, o.post.z); P.place(this.k.post, trs(_m, o.post.x, py - 0.05, o.post.z)); } else P.hide(this.k.post);
    P.commit();
  }
  hide() { this.q.hide(); const P = this.parts; P.hide(this.k.saddle); P.hide(this.k.rein); P.hide(this.k.post); P.commit(); }
}

// —— 牛（骑的那一份）：OxTeam 就是村里那头牛的样子；这里只管它的步子要按我们挪的路走 ——
export class MountOx {
  ox = new OxTeam('ox');
  /** 我们自己记的步相（OxTeam 的在里头看不见；给骑的人起落用，公式一样） */
  ph = 0;
  get parts() { return this.ox.parts; }
  /** 挪到 (x, z)、朝 yaw，这一步走得多快（v，米/秒）：让它自己的步子跟着走 */
  step(x: number, z: number, yaw: number, v: number, dt: number) {
    const o = this.ox;
    if (v > 0.02 && dt > 0) {
      // 从这一步的起点、朝着新的方向「走」过来：它的步相按走过的路往前推
      o.x = x - Math.sin(yaw) * v * dt; o.z = z - Math.cos(yaw) * v * dt; o.yaw = yaw;
      o.toward(x + Math.sin(yaw) * 100, z + Math.cos(yaw) * 100, v, dt);
      this.ph += (v * dt) / MOUNT.ox.stride;
    } else o.halt();
    o.x = x; o.z = z; o.yaw = yaw;
  }
  /** 背上坐处（世界坐标） */
  seat(out: THREE.Vector3) { return this.ox.back(out); }
}

/** 骑着的人身子怎么摆：坐在 seat（背上那一点）上、横着，脸朝牲口的左边；bob 是随步子的起落、sway 是左右晃 */
export function riderRoot(seat: THREE.Vector3, mountYaw: number, bob: number, sway: number, out: THREE.Vector3): { yaw: number } {
  const yaw = mountYaw + Math.PI / 2, fx = Math.sin(yaw), fz = Math.cos(yaw);
  // 凳心在脚后 cz：脚（root）在坐处往外 out 那么远；左右晃是顺着牲口身子的横向
  out.set(seat.x + fx * SEAT.out, seat.y - SEAT.h + bob, seat.z + fz * SEAT.out);
  out.x += fx * sway; out.z += fz * sway;
  return { yaw };
}

/** 同游的人骑着的那一头：他报来的是他的身子（root）在哪、朝哪，这边照着倒推出牲口在哪 */
function remoteMount(kind: MountKind): RemotePropKind {
  return {
    make() {
      const root = new THREE.Group(), mesh = new THREE.Group();
      root.add(mesh);
      // 牲口按世界坐标画：挂在 root 底下，每帧把 root 的变换抵掉（他藏起来、走远了，牲口跟着他一起藏）
      mesh.matrixAutoUpdate = false;
      const ox = kind === 'ox' ? new MountOx() : null, dk = kind === 'donkey' ? new MountDonkey('net:donkey') : null;
      if (ox) mesh.add(ox.parts.mesh); if (dk) mesh.add(dk.parts.mesh);
      const inv = new THREE.Matrix4();
      let lastX = NaN, lastZ = NaN;
      return {
        root,
        update(dt, t, speed) {
          root.updateMatrixWorld(true);
          inv.copy(root.matrixWorld).invert(); mesh.matrix.copy(inv); mesh.matrixWorldNeedsUpdate = true;
          // 他的身子朝牲口的左边：牲口朝 yaw − π/2，背脊正中在他脚的里边 out 那么远
          const ry = root.rotation.y, my = ry - Math.PI / 2, fx = Math.sin(ry), fz = Math.cos(ry);
          const sx = root.position.x - fx * SEAT.out, sz = root.position.z - fz * SEAT.out;
          const v = Number.isFinite(lastX) ? Math.min(2.5, Math.hypot(sx - lastX, sz - lastZ) / Math.max(dt, 1e-3)) : 0;
          lastX = sx; lastZ = sz;
          const sp = Math.max(v, speed * 0.5);
          if (ox) { ox.step(sx, sz, my, sp > 0.05 ? sp : 0, dt); ox.ox.update(dt, t); }
          if (dk) { const q = dk.q; q.x = sx; q.z = sz; q.yaw = my; q.v = sp > 0.05 ? sp : 0; q.goal = DONKEY.STAND; dk.place(dt, t, {}); }
        },
        dispose() { (ox?.parts.mesh ?? dk?.parts.mesh)?.geometry.dispose(); },
      };
    },
  };
}
export const remoteOx = () => remoteMount('ox');
export const remoteDonkey = () => remoteMount('donkey');
