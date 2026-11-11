/**
 * 几、案：木鱼的小方几、磬架、茶几、供桌都是同一路做法 ——
 * 案面（四边倒棱）、束腰、牙板（下沿一道壸门曲线）、四足（方足，下端微微放开成蹄）。
 */
import * as THREE from 'three';
import { extrude, lathe4, shade } from '../core/geo';
import type { Builder } from './kit';

export interface TableOpts {
  /** 案面厚 */
  top?: number;
  /** 足的粗细 */
  leg?: number;
  /** 束腰高（0 即没有） */
  waist?: number;
  /** 牙板高（0 即没有） */
  apron?: number;
  /** 足比案面边缘缩进多少 */
  inset?: number;
  /** 案面比足外扩（出沿） */
  over?: number;
}

/** 一块四边倒棱的板：w × t × d，顶面在 y=0 */
export function slab(w: number, t: number, d: number, bevel = 0.006, r = 0): THREE.BufferGeometry {
  const s = new THREE.Shape(), hw = w / 2 - bevel, hd = d / 2 - bevel;
  if (r > 0) {
    s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r); s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd);
    s.lineTo(-hw + r, hd); s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  } else { s.moveTo(-hw, -hd); s.lineTo(hw, -hd); s.lineTo(hw, hd); s.lineTo(-hw, hd); s.closePath(); }
  return extrude(s, t, 'x', 6, bevel).rotateX(-Math.PI / 2).translate(0, -t / 2, 0);
}

/** 牙板：长 L、高 h、厚 t；下沿是壸门曲线（两头垂、中间起），顶在 y=0，沿 x */
export function apronBoard(L: number, h: number, t: number): THREE.BufferGeometry {
  const s = new THREE.Shape(), a = L / 2, c = Math.min(L * 0.16, h * 2.2);
  s.moveTo(-a, 0); s.lineTo(a, 0); s.lineTo(a, -h);
  s.bezierCurveTo(a - c * 0.5, -h, a - c * 0.7, -h * 0.5, a - c, -h * 0.5);
  s.lineTo(c * 0.6, -h * 0.5);
  s.bezierCurveTo(c * 0.3, -h * 0.5, c * 0.2, -h * 0.72, 0, -h * 0.74);
  s.bezierCurveTo(-c * 0.2, -h * 0.72, -c * 0.3, -h * 0.5, -c * 0.6, -h * 0.5);
  s.lineTo(-a + c, -h * 0.5);
  s.bezierCurveTo(-a + c * 0.7, -h * 0.5, -a + c * 0.5, -h, -a, -h);
  s.closePath();
  return extrude(s, t, 'x', 8, Math.min(0.004, t * 0.2));
}

/** 一张几 / 案：w × d，通高 h，底在 y=0，中心在原点。返回案面的高度 */
export function lowTable(b: Builder, w: number, d: number, h: number, mat: string, o: TableOpts = {}): number {
  const k = Math.min(1, Math.max(0.45, h / 0.9));
  const t = o.top ?? 0.045 * k + 0.008, lw = o.leg ?? 0.085 * k + 0.012, wh = o.waist ?? 0.03 * k + 0.008, ah = o.apron ?? 0.11 * k + 0.02;
  const over = o.over ?? 0.025 * k + 0.008, inset = o.inset ?? 0;
  b.add(mat, slab(w, t, d, Math.min(0.008, t * 0.22)).translate(0, h, 0));
  const fw = w - over * 2 - inset * 2, fd = d - over * 2 - inset * 2, y1 = h - t;
  if (wh > 0) b.add(mat, shade(slab(fw - lw * 0.5, wh, fd - lw * 0.5, 0.002).translate(0, y1, 0), () => 0.82));
  const y2 = y1 - wh;
  // 牙板一圈
  if (ah > 0) {
    const pt = Math.min(0.022, lw * 0.3);
    for (const s of [1, -1]) {
      b.add(mat, apronBoard(fw - lw * 0.6, ah, pt).translate(0, y2, s * (fd / 2 - pt / 2 - 0.003)));
      b.add(mat, apronBoard(fd - lw * 0.6, ah, pt).rotateY(Math.PI / 2).translate(s * (fw / 2 - pt / 2 - 0.003), y2, 0));
    }
  }
  // 四足：上平、下收、近地处放开成蹄
  const hl = y2, a = lw / 2;
  const leg = () => lathe4([[a * 0.92, 0], [a * 1.08, 0.012 * k + 0.004], [a * 0.9, 0.05 * k + 0.012], [a * 0.82, hl * 0.42], [a * 0.94, hl * 0.86], [a, hl]]);
  for (const sx of [1, -1]) for (const sz of [1, -1]) b.add(mat, shade(leg().translate(sx * (fw / 2 - a), 0, sz * (fd / 2 - a)), (_x, y) => 0.84 + 0.16 * Math.min(1, y / (hl * 0.5))));
  return h;
}
