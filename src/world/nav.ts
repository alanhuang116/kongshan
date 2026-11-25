/**
 * 镜头，与这里的「处」。
 *   平时：远远跟在行者身后，放得平——人只占画面下半的一小块（点景），上半留给远山与天。
 *        拖动绕着他转（一圈三百六十度都有景）、上下看；滚轮 / 双指拉近推远；
 *        走起来而手没在转镜头时，镜头会慢慢转到他身后；被高墙挡住时把镜头收近。
 *        跑起来镜头稍退、视野略宽、跟得紧些（人不会冲到画面边上去）；停下来再慢慢回去。都是缓的，不晕、不抖。
 *   进了草堂：屋顶与南墙隐去，镜头从南面高处往里看（像看一出戏台）。只在南面敞着的那一个扇面里转，
 *        人走近东西山墙时镜头往南让一让（人不躲到墙后去）；俯仰、远近也收在一个范围里（不钻进院里的树）。进出都是从原处缓缓滑过去。
 *   做事时：活动给一个机位（pose），镜头缓缓过去，可在小范围内张望；做完再回到身后（草堂里回到南面那个看进去的镜头）。
 *   换处（村图上点一处）：画面淡成一片雾，人到了那里，再显出来。
 */
import * as THREE from 'three';
import type { World } from './core/World';
import type { Player } from './player';
import { PLACES as SITE_PLACES, SITE, YARD_Y } from './site';
import { boom, groundAt, placeAt, type Place, type Zone, blocked } from './walk';

/** 跟随时的视角（度）、俯仰（弧度）、远近（米） */
export const FOLLOW_FOV = 42, FOLLOW_PITCH = 0.14, FOLLOW_DIST = 8;

export interface PlaceDef {
  id: string;
  /** 处名（两三个字），与一句副题 */
  name: string; sub: string;
  /** 到这一处时人站在哪：x、z、朝向（弧度，0 朝 +z，π 朝北） */
  spawn?: [number, number, number];
  zone?: Zone;
}
export const PLACES: PlaceDef[] = SITE_PLACES.map((p) => ({ id: p.id, name: p.name, sub: p.note, spawn: p.spawn }));
export const PLACE = new Map(PLACES.map((p) => [p.id, p]));

/**
 * 活动的机位。yaw / up / down：拖动时能往左右、上下张望几度。
 * orbit（度）：给了就不是在原地张望，而是绕着看的那一点转（左右最多转这么多度、上下按 up / down），被墙挡着就收近一些——摸狗这样的近景用它。
 *   给 [a, b] 是两边不一样多：方位角往小里最多 a 度（负数）、往大里最多 b 度（转到人背后挡着狗的那一面就停）。
 */
export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov?: number; yaw?: number; up?: number; down?: number; orbit?: number | [number, number] }

const ease5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** 抬头看天：俯仰能往下拖到多少（平时最低 −0.12）；仰到底时镜头离人多远、视线仰角多大 */
const UP_MIN = -0.75, UP_DIST = 1.8, UP_EL = 0.92;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * 草堂里（屋顶、南墙连门窗都隐去了）：镜头只在南面敞着的那一个扇面里——从正南往左右各偏 HALL_YAW 弧度为止（再偏，人就躲到东西山墙后头，
 * 往西北还要钻进院子西北角那株梧桐里去）；俯仰、远近各收在一个范围里：[最低 / 最近, 进门时, 最高 / 最远]。
 * 俯仰低了、离得近了，人走到山墙边就被墙头挡住（扇面也被挤得很窄）；再高就成了一张平面图；再远，镜头退到院里的松、东厢的屋顶跟前去了。
 */
const HALL_YAW = 0.95, HALL_PITCH = [0.46, 0.66, 1.02] as const, HALL_DIST = [5.4, 9.2, 11.5] as const;
/** 竖着拿的手机上画幅窄：进门时退远一点，东西两间（榻、琴、茶炉、书案）也在画里 */
const HALL_DIST_TALL = 10.8;
/** 进出草堂时镜头从原处滑过去要几秒 */
const HALL_GLIDE = 0.9;
const HW = SITE.hall, HALL_TOP = YARD_Y + HW.floor + HW.wall;
/** 草堂的东、西、北三面墙（连墙厚、四角的柱，略放宽一点）：[x0, x1, z0, z1] */
const HALL_WALLS: Array<[number, number, number, number]> = (() => {
  const x0 = HW.x - HW.w / 2, x1 = HW.x + HW.w / 2, z0 = HW.z - HW.d / 2, z1 = HW.z + HW.d / 2, t = 0.42;
  return [[x0 - 0.05, x0 + t, z0 - 0.05, z1 + 0.15], [x1 - t, x1 + 0.05, z0 - 0.05, z1 + 0.15], [x0 - 0.05, x1 + 0.05, z0 - 0.05, z0 + t]];
})();
/** 从 b 看 c 的那一条线越不越得过草堂三面墙的墙头（屋顶隐去了，墙头以上都是空的） */
function overHallWalls(bx: number, by: number, bz: number, cx: number, cy: number, cz: number): boolean {
  const dx = cx - bx, dz = cz - bz;
  for (const [x0, x1, z0, z1] of HALL_WALLS) {
    // 平面上这条线进、出这一段墙的那一截（t0…t1）
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (bx < x0 || bx > x1) continue; } else { const a = (x0 - bx) / dx, b = (x1 - bx) / dx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (Math.abs(dz) < 1e-9) { if (bz < z0 || bz > z1) continue; } else { const a = (z0 - bz) / dz, b = (z1 - bz) / dz; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (t0 > t1) continue;
    // 线是往上走的：在墙里最低的一点就是进墙的那一点，那里要高过墙头一点
    if (by + (cy - by) * t0 < HALL_TOP + 0.12) return false;
  }
  return true;
}

export class Nav {
  /** 人此刻在哪一处 */
  place: Place = placeAt(SITE.entry.x, SITE.entry.z);
  get cur() { return this.place.id; }
  /** 正在换处（画面暗着） */
  busy = false;
  onPlace: ((id: string) => void) | null = null;
  /** 跟随：绕人的方位、俯仰、远近（都是目标值，另有平滑后的） */
  yaw = 0; pitch = FOLLOW_PITCH; dist = FOLLOW_DIST;
  private yawS = 0; private pitchS = FOLLOW_PITCH; private distS = FOLLOW_DIST; private boomS = 1;
  /** 人在草堂里（屋顶、南墙已隐去）：镜头不必躲墙、不必钻在屋檐下，只在南面的扇面里（由 setHall 开关） */
  open = false;
  /** 草堂里此刻往左右能偏到哪（东西山墙限着，follow 里每帧算） */
  private hallLo = -HALL_YAW; private hallHi = HALL_YAW;
  /** 进草堂前屋外的俯仰、远近（出来时还原） */
  private outPitch = FOLLOW_PITCH; private outDist = FOLLOW_DIST;
  /** 进出草堂时画面上的镜头从原处滑过去：滑了几成、要几秒；起点（镜头与看的那一点，都相对于人的头记，人走着也跟得上） */
  private glideK = 1; private glideDur = HALL_GLIDE; private gOff = new THREE.Vector3(); private gLook = new THREE.Vector3();
  /** snapBehind 之后过了几帧（人刚被放到别处的那一两帧里，进出草堂照 snapBehind 摆的来，不另外滑、不另外收） */
  private snapAge = 9;
  private tgt = new THREE.Vector3(); private inited = false;
  private idle = 9;
  /** 跑了几成（0…1）：起来得快些，回去得慢 */
  private runK = 0;
  /** 镜头贴得太近，人暂时不画 */
  private hid = false;
  // 机位
  private pose: Pose | null = null; private poseK = 1; private poseDur = 1.2; private poseOut = false;
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: FOLLOW_FOV };
  private offYaw = 0; private offPitch = 0; private offYawG = 0; private offPitchG = 0; private zoom = 0; private zoomG = 0;
  /** 绕着看时镜头离看的那一点多远（被墙挡着收近，收得快、放得慢） */
  private orbitD = 0; private orbitP = new THREE.Vector3();
  private pos = new THREE.Vector3(); private look = new THREE.Vector3(); private fov = FOLLOW_FOV;
  private fpos = new THREE.Vector3(); private flook = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** 画面压黑（0…1） */
  fade = 0; private fadeG = 0; private fadeDone: (() => void) | null = null;
  /**
   * 取景偏移：把画面里的主体往右（x 为正）、往上（y 为正）让出几成画幅——界面上有面板时，人别被它挡着。
   * 只在活动的机位里起作用；界面那一层设目标值，这里缓缓过去。
   */
  frame = new THREE.Vector2(); private frameS = new THREE.Vector2();

  constructor(private world: World, private player: Player) {}

  get inPose() { return !!this.pose && !this.poseOut; }
  /** 镜头绕人的方位（行走的「前」由它定） */
  get camYaw() { return this.yawS; }

  /** 把镜头直接摆到人的身后（换处之后） */
  snapBehind(pitch = FOLLOW_PITCH, dist = FOLLOW_DIST) {
    this.yaw = this.yawS = wrap(this.player.yaw + Math.PI);
    this.pitch = this.pitchS = pitch; this.dist = this.distS = dist; this.boomS = 1; this.runK = 0;
    this.inited = false; this.pose = null; this.poseOut = false; this.poseK = 1; this.glideK = 1; this.snapAge = 0;
    this.offYaw = this.offPitch = this.offYawG = this.offPitchG = this.zoom = this.zoomG = 0;
    // 还在草堂里（屋里换了个地方站）：仍从南面看进去，出草堂时还原成上面这一份
    if (this.open && placeAt(this.player.pos.x, this.player.pos.z).indoor >= 1) { this.outPitch = pitch; this.outDist = dist; this.hallView(); }
  }
  /** 草堂里的镜头一下子摆好：进门时的俯仰、远近；左右取人背后那一侧、最多偏一小半（面朝北站着就是正南；背后是北墙的，就正南） */
  private hallView() {
    const b = wrap(this.player.yaw + Math.PI);
    this.yaw = this.yawS = Math.abs(b) <= Math.PI / 2 ? clamp(b, -HALL_YAW / 2, HALL_YAW / 2) : 0;
    this.pitch = this.pitchS = HALL_PITCH[1]; this.dist = this.distS = this.hallDist0(); this.boomS = 1; this.glideK = 1;
  }
  /** 进草堂时的远近（竖屏退远一点） */
  private hallDist0() { return this.world.camera.aspect < 0.8 ? HALL_DIST_TALL : HALL_DIST[1]; }
  /**
   * 进出草堂（Anlewo 按人在哪里来叫）。进去：屋外的俯仰远近记下，镜头升到南面高处往里看——原本就在南面一带的照原来的偏向，偏得多的收进扇面里；
   * 出来：还原（偏向照旧）。画面上的镜头都是从原处缓缓滑过去（不绕着人转大圈，就不会从墙里、树里穿过去）；画面正暗着、正在做事时直接换；
   * 人刚被放过来（snapBehind 才摆过）的，照它摆的。
   */
  setHall(on: boolean) {
    if (on === this.open) return;
    this.open = on;
    const fresh = this.snapAge <= 1, cut = fresh || this.fade > 0.3 || !!this.pose;
    if (on) {
      this.outPitch = this.pitch; this.outDist = this.dist;
      if (cut) { this.hallView(); return; }
      this.yaw = clamp(this.yaw, -HALL_YAW, HALL_YAW); this.pitch = HALL_PITCH[1]; this.dist = this.hallDist0();
    } else {
      this.glideK = 1;
      if (fresh) return;
      this.pitch = this.outPitch; this.dist = this.outDist;
      if (cut) { this.yawS = this.yaw; this.pitchS = this.pitch; this.distS = this.dist; this.boomS = 1; return; }
    }
    // 跟随的那一套直接到位；画面上的镜头另外从原处滑过去
    this.yawS = this.yaw; this.pitchS = this.pitch; this.distS = this.dist; this.boomS = 1; this.idle = 0;
    this.gOff.copy(this.pos).sub(this.tgt); this.gLook.copy(this.look).sub(this.tgt);
    this.glideK = 0; this.glideDur = HALL_GLIDE;
  }

  /** 活动的机位；null 即回到人的身后（草堂里回到南面那个看进去的镜头） */
  setPose(p: Pose | null, dur = 1.3) {
    const cam = this.world.camera;
    this.from.pos.copy(cam.position);
    this.from.look.copy(cam.getWorldDirection(this.tmp)).multiplyScalar(8).add(cam.position);
    this.from.fov = this.fov;
    this.offYawG = this.offPitchG = 0; this.zoomG = 0; this.glideK = 1;
    if (!p) {
      if (!this.pose) return;
      this.poseOut = true; this.poseK = 0; this.poseDur = dur;
      if (this.open) {
        // 草堂里：回到做事以前那个从南面看进去的镜头（人背后多半是北墙、山墙，绕过去就看不见人了）
        this.yawS = this.yaw; this.pitchS = this.pitch; this.distS = this.dist; this.boomS = 1;
      } else {
        // 回到身后时别从很怪的角度绕回来：就取人此刻的背后
        this.yaw = this.yawS = wrap(this.player.yaw + Math.PI); this.pitch = this.pitchS = FOLLOW_PITCH; this.boomS = 1;
      }
      return;
    }
    this.pose = p; this.poseOut = false; this.poseK = 0; this.poseDur = dur;
    this.orbitD = p.pos.distanceTo(p.look);
  }

  /** 拖动：平时绕着人转；做事时在机位附近张望 */
  drag(dx: number, dy: number) {
    if (this.busy) return;
    if (this.pose && !this.poseOut) {
      const k = (this.fov / FOLLOW_FOV) * 0.11, p = this.pose;
      if (p.orbit) {
        // 绕着转：手往右拖，镜头往左绕（景跟着手走）；往上拖，镜头低下去、往上看
        // 转到有墙、有屋、有柱子挡着的那一面就停住（不往东西里挤）
        const [o0, o1] = Array.isArray(p.orbit) ? p.orbit : [-p.orbit, p.orbit];
        const next = Math.max(o0, Math.min(o1, this.offYawG - dx * 0.32));
        if (this.orbitClear(p, next)) this.offYawG = next;
        this.offPitchG = Math.max(-(p.down ?? 10), Math.min(p.up ?? 25, this.offPitchG + dy * 0.2));
        return;
      }
      this.offYawG = Math.max(-(p.yaw ?? 12), Math.min(p.yaw ?? 12, this.offYawG + dx * k));
      this.offPitchG = Math.max(-(p.down ?? 8), Math.min(p.up ?? 8, this.offPitchG + dy * k));
      return;
    }
    this.idle = 0;
    if (this.open) {
      // 草堂里：只在南面的扇面里转（再偏，人就躲到山墙后头去了），俯仰也收在那个范围里
      this.yaw = clamp(this.yaw - dx * 0.0052, this.hallLo, this.hallHi);
      this.pitch = clamp(this.pitch + dy * 0.0042, HALL_PITCH[0], HALL_PITCH[2]);
      return;
    }
    this.yaw = wrap(this.yaw - dx * 0.0052);
    this.pitch = Math.max(this.upOk() ? UP_MIN : -0.12, Math.min(1.15, this.pitch + dy * 0.0042));
  }
  /** 能不能抬头看天：在屋外（屋里有顶，草堂里屋顶虽隐去了也不往上仰） */
  private upOk() { return !this.open && this.place.indoor < 0.5; }
  /** 远近：平时 2.2…18 米；草堂里收在看得清屋里、又碰不着院里东西的那一段 */
  private zoomTo(d: number) { return this.open ? clamp(d, HALL_DIST[0], HALL_DIST[2]) : clamp(d, 2.2, 18); }
  wheel(dy: number) {
    if (this.pose && !this.poseOut) { this.zoomG = Math.max(0, Math.min(1, this.zoomG - dy * 0.0012)); return; }
    this.dist = this.zoomTo(this.dist * Math.exp(dy * 0.0011));
    this.idle = 0;
  }
  /** 键盘转镜头（Q / E、左右方向键）：rate 是弧度/秒，正为往右转 */
  turn(rate: number, dt: number) {
    if (this.busy || (this.pose && !this.poseOut)) return;
    this.yaw = this.open ? clamp(this.yaw - rate * dt, this.hallLo, this.hallHi) : wrap(this.yaw - rate * dt);
    this.idle = 0;
  }
  /** 双指：scale > 1 是张开（拉近） */
  pinch(scale: number) { this.dist = this.zoomTo(this.dist / scale); this.idle = 0; }

  /** 画面沉入墨色 → 做 fn（把人放到别处）→ 再亮起来 */
  travel(fn: () => void): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true; this.fadeG = 1;
    return new Promise((resolve) => {
      this.fadeDone = () => {
        fn();
        this.snapBehind();
        this.fadeG = 0; this.busy = false;
        this.updatePlace(true);
        resolve();
      };
    });
  }

  private updatePlace(force = false) {
    const p = this.player, pl = placeAt(p.pos.x, p.pos.z, p.zone);
    if (force || pl.id !== this.place.id) { this.place = pl; this.onPlace?.(pl.id); } else this.place = pl;
  }

  /** 跟随时镜头该在哪：写进 fpos / flook */
  private follow(dt: number) {
    const p = this.player, sm = (r: number) => 1 - Math.exp(-dt * r);
    // 跑了几成：快起来时一秒上下到位，停下来两三秒才回去
    const rk = Math.max(0, Math.min(1, (p.speed - 2.3) / 1.9)), rkS = rk * rk * (3 - 2 * rk);
    this.runK += (rkS - this.runK) * sm(rkS > this.runK ? 1.8 : 0.75);
    const head = this.tmp.set(p.pos.x, p.pos.y + 1.28, p.pos.z), fr = 11 + 8 * this.runK;
    if (!this.inited) { this.tgt.copy(head); this.inited = true; } else { this.tgt.x += (head.x - this.tgt.x) * sm(fr); this.tgt.z += (head.z - this.tgt.z) * sm(fr); this.tgt.y += (head.y - this.tgt.y) * sm(6); }
    // 走着、手又没在转镜头：镜头慢慢转到身后（迎着镜头走时不转，免得天旋地转）
    this.idle += dt;
    // 跟得要慢：横着走时镜头若跟得急，「左」就一直在变，人会绕起圈来（跑起来略快一点）
    if (p.moving && this.idle > 1.4 && !p.locked && !this.open) {
      const d = wrap(p.yaw + Math.PI - this.yaw);
      if (Math.abs(d) < 2.2) this.yaw = wrap(this.yaw + d * Math.min(1, dt * (0.3 + 0.2 * this.runK)) * Math.min(1, p.speed / 1.6));
    }
    // 抬着头的时候一迈步（或进了屋）就慢慢低回来（进屋一下子回来）
    if (this.pitch < -0.12 && (p.moving || !this.upOk())) this.pitch += (-0.12 - this.pitch) * (this.upOk() ? sm(1.6) : 1);
    // 草堂里：人走近东西山墙时，从他脚下到镜头那条线要越得过墙头——越不过就把镜头往南推一些（不让人躲到墙后去）
    if (this.open && this.snapAge > 0) { this.hallLimits(); this.yaw = clamp(this.yaw, this.hallLo, this.hallHi); }
    this.yawS = wrap(this.yawS + wrap(this.yaw - this.yawS) * sm(13));
    this.pitchS += (this.pitch - this.pitchS) * sm(13);
    // 抬头看天（屋外往上拖过了平时的最低处，up 0…1）：镜头再低一些、凑到身后，往天上仰到五十来度；人的头肩留在画面下沿
    const u0 = Math.max(0, Math.min(1, (-0.12 - this.pitchS) / (-0.12 - UP_MIN))), up = u0 * u0 * (3 - 2 * u0);
    const pitchP = up > 0 ? -0.12 - 0.38 * up : this.pitchS;
    // 跑起来稍退一些（屋里不退）
    this.distS += (this.dist * (1 + (this.open ? 0 : 0.15 * this.runK)) - this.distS) * sm(8);
    const distU = this.distS + (UP_DIST - this.distS) * up;
    const cp = Math.cos(pitchP), dx = Math.sin(this.yawS) * cp, dy = Math.sin(pitchP), dz = Math.cos(this.yawS) * cp;
    // 被高墙挡住就收近（收得快、放得慢）
    const want = this.open ? 1 : boom(this.tgt.x, this.tgt.z, this.tgt.x + dx * distU, this.tgt.z + dz * distU, p.zone);
    this.boomS += (want - this.boomS) * (want < this.boomS ? sm(30) : sm(2.2));
    // 背后就是墙时镜头可以贴得很近（宁可贴近，不进墙）；近到快碰着头了，就不画人（像是从他眼里看出去）
    const d = this.boomS < 0.999 ? Math.max(0.4, distU * this.boomS - 0.3) : distU;
    if (!this.pose) {
      if (d < 0.62 && !this.hid) { this.hid = true; p.setVisible(false); } else if (d > 0.82 && this.hid) { this.hid = false; p.setVisible(true); }
    } else if (this.hid) { this.hid = false; p.setVisible(true); }
    // 屋里别穿到顶棚上面去；屋外别钻到地下
    let y = this.tgt.y + dy * d;
    if (!this.open && y > this.place.ceil - 0.2) y = this.place.ceil - 0.2;
    const cx = this.tgt.x + dx * d, cz = this.tgt.z + dz * d;
    const g = groundAt(cx, cz, p.zone);
    if (g != null && y < g + 0.34) y = g + 0.34;
    this.fpos.set(cx, y, cz);
    // 看的那一点比头高一些（越远抬得越多）：人落在画面下半，上半是远山与天
    // （竖屏画幅高：少抬一些，天不至于空掉半幅）
    const lift = this.world.camera.aspect < 1 ? 0.035 : 0.075;
    this.flook.copy(this.tgt); this.flook.y += 0.1 + lift * d * (1 - Math.min(1, Math.max(0, this.pitchS - 0.2) / 0.5));
    if (up > 0.001) {
      // 往天上仰：从镜头出发、朝着人的那个方向、仰角 UP_EL 的那一点
      const hx = this.tgt.x - cx, hz = this.tgt.z - cz, hl = Math.hypot(hx, hz) || 1;
      this.tmp.set(cx + (hx / hl) * Math.cos(UP_EL) * 12, y + Math.sin(UP_EL) * 12, cz + (hz / hl) * Math.cos(UP_EL) * 12);
      this.flook.lerp(this.tmp, up);
    }
  }

  update(dt: number, t: number) {
    // 墨色
    if (this.fade !== this.fadeG) {
      const s = (Math.sign(this.fadeG - this.fade) * dt) / 0.42;
      this.fade = Math.abs(this.fadeG - this.fade) <= Math.abs(s) ? this.fadeG : this.fade + s;
      if (this.fade >= 1 && this.fadeDone) { const f = this.fadeDone; this.fadeDone = null; f(); }
    }
    this.updatePlace();
    this.follow(dt);
    const sm = 1 - Math.exp(-dt * 7), sf = 1 - Math.exp(-dt * 2.2), inPose = this.pose && !this.poseOut;
    this.frameS.x += ((inPose ? this.frame.x : 0) - this.frameS.x) * sf; this.frameS.y += ((inPose ? this.frame.y : 0) - this.frameS.y) * sf;
    this.offYaw += (this.offYawG - this.offYaw) * sm; this.offPitch += (this.offPitchG - this.offPitch) * sm; this.zoom += (this.zoomG - this.zoom) * sm;
    if (this.pose) {
      this.poseK = Math.min(1, this.poseK + dt / this.poseDur);
      const k = ease5(this.poseK);
      const tp = this.poseOut ? this.fpos : this.pose.orbit ? this.orbitPos(this.pose, dt) : this.pose.pos, tl = this.poseOut ? this.flook : this.pose.look;
      this.pos.lerpVectors(this.from.pos, tp, k); this.look.lerpVectors(this.from.look, tl, k);
      this.fov = this.from.fov + ((this.poseOut ? FOLLOW_FOV : this.pose.fov ?? 40) - this.from.fov) * k;
      if (this.poseOut && this.poseK >= 1) { this.pose = null; this.poseOut = false; }
    } else {
      if (this.glideK < 1) {
        // 进出草堂：从原处（跟着人）缓缓滑到跟随的位置
        this.glideK = Math.min(1, this.glideK + dt / this.glideDur);
        const k = ease5(this.glideK);
        this.pos.copy(this.gOff).add(this.tgt).lerp(this.fpos, k); this.look.copy(this.gLook).add(this.tgt).lerp(this.flook, k);
      } else { this.pos.copy(this.fpos); this.look.copy(this.flook); }
      // 跑起来视野略宽（四度上下）
      this.fov += (FOLLOW_FOV + 4 * this.runK - this.fov) * Math.min(1, dt * 4);
    }
    this.apply(t);
    this.snapAge = Math.min(9, this.snapAge + 1);
  }

  /** 草堂里此刻往左右能偏到哪：从正南往两边一点一点试，试到人的脚被山墙挡住为止（再二分几回取准） */
  private hallLimits() {
    const p = this.player.pos, t = this.tgt, r = Math.cos(this.pitchS) * this.distS, cy = t.y + Math.sin(this.pitchS) * this.distS, fy = p.y + 0.04;
    const sees = (a: number) => overHallWalls(p.x, fy, p.z, t.x + Math.sin(a) * r, cy, t.z + Math.cos(a) * r);
    const edge = (s: number) => {
      const N = 16;
      let ok = 0;
      for (let i = 1; i <= N; i++) {
        const a = (HALL_YAW * i) / N;
        if (sees(s * a)) { ok = a; continue; }
        let lo = ok, hi = a;
        for (let j = 0; j < 5; j++) { const m = (lo + hi) / 2; if (sees(s * m)) lo = m; else hi = m; }
        return lo;
      }
      return HALL_YAW;
    };
    this.hallHi = edge(1); this.hallLo = -edge(-1);
  }

  private apply(t: number) {
    const cam = this.world.camera;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (this.pose && !this.poseOut) {
      cam.position.y += Math.sin(t * 0.7) * 0.004;
      if (!this.pose.orbit && (this.offYaw || this.offPitch)) { cam.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (this.offYaw * Math.PI) / 180); cam.rotateX((this.offPitch * Math.PI) / 180); }
    }
    // 竖屏：横向会窄，把竖直视角放大一些，别把景裁没了
    const a = cam.aspect, base = (this.fov * (1 - 0.3 * this.zoom) * Math.PI) / 180;
    const h0 = 2 * Math.atan(Math.tan(base / 2) * 1.6);
    const keep = a >= 1.6 ? 1 : 1 - 0.36 * Math.min(1, (1.6 - a) / 1.1);
    let v = a >= 1.6 ? base : 2 * Math.atan(Math.tan((h0 * keep) / 2) / a);
    v = Math.min(v, (84 * Math.PI) / 180);
    const deg = (v * 180) / Math.PI;
    if (Math.abs(cam.fov - deg) > 0.01) { cam.fov = deg; cam.updateProjectionMatrix(); }
    // 取景偏移：镜头往左转，主体就往右去；镜头往下看，主体就往上去
    if (Math.abs(this.frameS.x) > 1e-4 || Math.abs(this.frameS.y) > 1e-4) {
      const hf = 2 * Math.atan(Math.tan(v / 2) * a);
      cam.rotateOnWorldAxis(Y_AXIS, this.frameS.x * hf);
      cam.rotateX(-this.frameS.y * v);
    }
    cam.updateMatrixWorld();
  }

  /** 绕到 offYaw（度）那一面时，镜头与看的那一点之间是不是空的（高墙、屋、柱、篱笆都算） */
  private orbitClear(p: Pose, offYaw: number): boolean {
    const L = p.look, vx = p.pos.x - L.x, vz = p.pos.z - L.z, r = Math.hypot(vx, vz) || 1;
    const yaw = Math.atan2(vx, vz) + (offYaw * Math.PI) / 180, ex = L.x + Math.sin(yaw) * r, ez = L.z + Math.cos(yaw) * r;
    if (boom(L.x, L.z, ex, ez, this.player.zone) < 0.92) return false;
    for (let t = 0.35; t <= 1.001; t += 0.13) if (blocked(L.x + (ex - L.x) * t, L.z + (ez - L.z) * t, this.player.zone, 0.06)) return false;
    return true;
  }
  /** 绕着看的机位：把原来的机位绕看的那一点转过 offYaw、抬高 offPitch；被墙挡着就收近（不进墙、不钻地） */
  private orbitPos(p: Pose, dt: number): THREE.Vector3 {
    const L = p.look, vx = p.pos.x - L.x, vy = p.pos.y - L.y, vz = p.pos.z - L.z, r = Math.hypot(vx, vy, vz) || 1;
    const yaw = Math.atan2(vx, vz) + (this.offYaw * Math.PI) / 180;
    const el = Math.max(-0.12, Math.min(1.25, Math.asin(Math.max(-1, Math.min(1, vy / r))) + (this.offPitch * Math.PI) / 180));
    const ch = Math.cos(el), want = boom(L.x, L.z, L.x + Math.sin(yaw) * ch * r, L.z + Math.cos(yaw) * ch * r, this.player.zone);
    const d = want < 0.999 ? Math.max(0.8, r * want - 0.3) : r;
    this.orbitD += (d - this.orbitD) * Math.min(1, dt * (d < this.orbitD ? 14 : 2.5));
    const o = this.orbitP.set(L.x + Math.sin(yaw) * ch * this.orbitD, L.y + Math.sin(el) * this.orbitD, L.z + Math.cos(yaw) * ch * this.orbitD);
    const g = groundAt(o.x, o.z, this.player.zone);
    if (g != null && o.y < g + 0.3) o.y = g + 0.3;
    return o;
  }

  /** 世界里的一点落在屏幕的哪里（像素）；在镜头后面或画面外则 visible 为假 */
  project(v: THREE.Vector3, out: { x: number; y: number; visible: boolean; dist: number }) {
    const cam = this.world.camera;
    this.tmp.copy(v).project(cam);
    out.dist = v.distanceTo(cam.position);
    out.visible = this.tmp.z > -1 && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.02 && Math.abs(this.tmp.y) < 1.02;
    out.x = (this.tmp.x * 0.5 + 0.5) * this.world.size.x; out.y = (-this.tmp.y * 0.5 + 0.5) * this.world.size.y;
    return out;
  }
}
