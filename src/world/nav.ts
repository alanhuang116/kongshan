/**
 * 镜头，与寺里的「处」。
 *   平时：跟在行者身后上方（第三人称）。拖动绕着他转、上下看；滚轮 / 双指拉近推远；
 *        走起来而手没在转镜头时，镜头会慢慢转到他身后；被高墙挡住时把镜头收近，进了屋不会穿到顶棚上面去。
 *   做事时：活动给一个机位（pose），镜头缓缓过去，可在小范围内张望；做完再回到身后。
 *   换处（寺图上点一处、上下楼）：画面沉入墨色，人到了那里，再亮起来。
 */
import * as THREE from 'three';
import type { World } from './core/World';
import type { Player } from './player';
import { L } from './layout';
import { boom, groundAt, placeAt, type Place, type Zone } from './walk';

export interface PlaceDef {
  id: string;
  /** 处名（两三个字），与一句副题 */
  name: string; sub: string;
  /** 到这一处时人站在哪：x、z、朝向（弧度，0 朝 +z，π 朝北） */
  spawn?: [number, number, number];
  zone?: Zone;
}
export const PLACES: PlaceDef[] = [
  { id: 'foot', name: '山道', sub: '石阶向上，没在雾里', spawn: [0, L.stair.z1 + 3.1, Math.PI] },
  { id: 'gate', name: '山门', sub: '入此门来', spawn: [0, 53.6, Math.PI] },
  { id: 'court', name: '石桥', sub: '一池，一桥，一殿', spawn: [0, 39.8, Math.PI] },
  { id: 'pond', name: '莲池', sub: '水静则明', spawn: [-7.4, 39.3, 2.6] },
  { id: 'censer', name: '香炉', sub: '一炷清香', spawn: [0, L.censer.z + 3.6, Math.PI] },
  { id: 'tree', name: '银杏', sub: '叶落归根', spawn: [-7.3, 10.8, -2.36] },
  // 上了楼站在朝院子的那一侧（西 / 东），离钟、鼓两步
  { id: 'bell', name: '钟楼', sub: '晨钟', spawn: [L.bell.x - 1.6, L.bell.z + 0.6, Math.PI / 2], zone: 'bell' },
  { id: 'drum', name: '鼓楼', sub: '暮鼓', spawn: [L.drum.x + 1.6, L.drum.z + 0.6, -Math.PI / 2], zone: 'drum' },
  { id: 'steps', name: '殿前', sub: '月台之上', spawn: [0, 5.9, Math.PI] },
  { id: 'hall', name: '大殿', sub: '如是', spawn: [0, 2.7, Math.PI] },
  { id: 'study', name: '经房', sub: '一灯，一案，一卷', spawn: [L.study.x + 1.3, L.study.z, -Math.PI / 2] },
  { id: 'tea', name: '茶寮', sub: '吃茶去', spawn: [L.tea.x - 1.4, L.tea.z + 1.2, Math.PI / 2] },
  { id: 'terrace', name: '云台', sub: '行到水穷处，坐看云起时', spawn: [31.4, L.terrace.cz, Math.PI / 2] },
  // 走得到、但不在寺图上的地方
  { id: 'yard', name: '庭院', sub: '粉墙，黛瓦，一地天光' },
  { id: 'back', name: '后院', sub: '竹在墙根' },
];
export const PLACE = new Map(PLACES.map((p) => [p.id, p]));

export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov?: number; yaw?: number; up?: number; down?: number }

const ease5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export class Nav {
  /** 人此刻在哪一处 */
  place: Place = placeAt(0, 90, 'ground');
  get cur() { return this.place.id; }
  /** 正在换处（画面暗着） */
  busy = false;
  onPlace: ((id: string) => void) | null = null;
  /** 跟随：绕人的方位、俯仰、远近（都是目标值，另有平滑后的） */
  yaw = 0; pitch = 0.3; dist = 5.2;
  private yawS = 0; private pitchS = 0.3; private distS = 5.2; private boomS = 1;
  private tgt = new THREE.Vector3(); private inited = false;
  private idle = 9;
  /** 镜头贴得太近，人暂时不画 */
  private hid = false;
  // 机位
  private pose: Pose | null = null; private poseK = 1; private poseDur = 1.2; private poseOut = false;
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50 };
  private offYaw = 0; private offPitch = 0; private offYawG = 0; private offPitchG = 0; private zoom = 0; private zoomG = 0;
  private pos = new THREE.Vector3(); private look = new THREE.Vector3(); private fov = 50;
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
  snapBehind(pitch = 0.3, dist = 5.2) {
    this.yaw = this.yawS = wrap(this.player.yaw + Math.PI);
    this.pitch = this.pitchS = pitch; this.dist = this.distS = dist; this.boomS = 1;
    this.inited = false; this.pose = null; this.poseOut = false; this.poseK = 1;
    this.offYaw = this.offPitch = this.offYawG = this.offPitchG = this.zoom = this.zoomG = 0;
  }

  /** 活动的机位；null 即回到人的身后 */
  setPose(p: Pose | null, dur = 1.3) {
    const cam = this.world.camera;
    this.from.pos.copy(cam.position);
    this.from.look.copy(cam.getWorldDirection(this.tmp)).multiplyScalar(8).add(cam.position);
    this.from.fov = this.fov;
    this.offYawG = this.offPitchG = 0; this.zoomG = 0;
    if (!p) {
      if (!this.pose) return;
      this.poseOut = true; this.poseK = 0; this.poseDur = dur;
      // 回到身后时别从很怪的角度绕回来：就取人此刻的背后
      this.yaw = this.yawS = wrap(this.player.yaw + Math.PI); this.pitch = this.pitchS = 0.3; this.boomS = 1;
      return;
    }
    this.pose = p; this.poseOut = false; this.poseK = 0; this.poseDur = dur;
  }

  /** 拖动：平时绕着人转；做事时在机位附近张望 */
  drag(dx: number, dy: number) {
    if (this.busy) return;
    if (this.pose && !this.poseOut) {
      const k = (this.fov / 50) * 0.11, p = this.pose;
      this.offYawG = Math.max(-(p.yaw ?? 12), Math.min(p.yaw ?? 12, this.offYawG + dx * k));
      this.offPitchG = Math.max(-(p.down ?? 8), Math.min(p.up ?? 8, this.offPitchG + dy * k));
      return;
    }
    this.yaw = wrap(this.yaw - dx * 0.0052);
    this.pitch = Math.max(-0.16, Math.min(1.2, this.pitch + dy * 0.0042));
    this.idle = 0;
  }
  wheel(dy: number) {
    if (this.pose && !this.poseOut) { this.zoomG = Math.max(0, Math.min(1, this.zoomG - dy * 0.0012)); return; }
    this.dist = Math.max(1.9, Math.min(11, this.dist * Math.exp(dy * 0.0011)));
    this.idle = 0;
  }
  /** 键盘转镜头（Q / E、左右方向键）：rate 是弧度/秒，正为往右转 */
  turn(rate: number, dt: number) { if (this.busy || (this.pose && !this.poseOut)) return; this.yaw = wrap(this.yaw - rate * dt); this.idle = 0; }
  /** 双指：scale > 1 是张开（拉近） */
  pinch(scale: number) { this.dist = Math.max(1.9, Math.min(11, this.dist / scale)); this.idle = 0; }

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
    const head = this.tmp.set(p.pos.x, p.pos.y + 1.28, p.pos.z);
    if (!this.inited) { this.tgt.copy(head); this.inited = true; } else { this.tgt.x += (head.x - this.tgt.x) * sm(11); this.tgt.z += (head.z - this.tgt.z) * sm(11); this.tgt.y += (head.y - this.tgt.y) * sm(6); }
    // 走着、手又没在转镜头：镜头慢慢转到身后（迎着镜头走时不转，免得天旋地转）
    this.idle += dt;
    // 跟得要慢：横着走时镜头若跟得急，「左」就一直在变，人会绕起圈来
    if (p.moving && this.idle > 1.4 && !p.locked) {
      const d = wrap(p.yaw + Math.PI - this.yaw);
      if (Math.abs(d) < 2.2) this.yaw = wrap(this.yaw + d * Math.min(1, dt * 0.3) * Math.min(1, p.speed / 1.6));
    }
    this.yawS = wrap(this.yawS + wrap(this.yaw - this.yawS) * sm(13));
    this.pitchS += (this.pitch - this.pitchS) * sm(13);
    this.distS += (this.dist - this.distS) * sm(8);
    const cp = Math.cos(this.pitchS), dx = Math.sin(this.yawS) * cp, dy = Math.sin(this.pitchS), dz = Math.cos(this.yawS) * cp;
    // 被高墙挡住就收近（收得快、放得慢）
    const want = boom(this.tgt.x, this.tgt.z, this.tgt.x + dx * this.distS, this.tgt.z + dz * this.distS, p.zone);
    this.boomS += (want - this.boomS) * (want < this.boomS ? sm(30) : sm(2.2));
    // 背后就是墙时镜头可以贴得很近（宁可贴近，不进墙）；近到快碰着头了，就不画人（像是从他眼里看出去）
    const d = this.boomS < 0.999 ? Math.max(0.4, this.distS * this.boomS - 0.3) : this.distS;
    if (!this.pose) {
      if (d < 0.62 && !this.hid) { this.hid = true; p.setVisible(false); } else if (d > 0.82 && this.hid) { this.hid = false; p.setVisible(true); }
    } else if (this.hid) { this.hid = false; p.setVisible(true); }
    // 屋里别穿到顶棚上面去；屋外别钻到地下
    let y = this.tgt.y + dy * d;
    if (y > this.place.ceil - 0.2) y = this.place.ceil - 0.2;
    const cx = this.tgt.x + dx * d, cz = this.tgt.z + dz * d;
    const g = groundAt(cx, cz, p.zone);
    if (g != null && y < g + 0.34) y = g + 0.34;
    this.fpos.set(cx, y, cz);
    this.flook.copy(this.tgt); this.flook.y += 0.12 + 0.1 * (1 - Math.min(1, d / 3));
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
      const tp = this.poseOut ? this.fpos : this.pose.pos, tl = this.poseOut ? this.flook : this.pose.look;
      this.pos.lerpVectors(this.from.pos, tp, k); this.look.lerpVectors(this.from.look, tl, k);
      this.fov = this.from.fov + ((this.poseOut ? 50 : this.pose.fov ?? 44) - this.from.fov) * k;
      if (this.poseOut && this.poseK >= 1) { this.pose = null; this.poseOut = false; }
    } else {
      this.pos.copy(this.fpos); this.look.copy(this.flook);
      this.fov += (50 - this.fov) * Math.min(1, dt * 4);
    }
    this.apply(t);
  }

  private apply(t: number) {
    const cam = this.world.camera;
    cam.position.copy(this.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    if (this.pose && !this.poseOut) {
      cam.position.y += Math.sin(t * 0.7) * 0.004;
      if (this.offYaw || this.offPitch) { cam.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (this.offYaw * Math.PI) / 180); cam.rotateX((this.offPitch * Math.PI) / 180); }
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
