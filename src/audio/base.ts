/** 环境层的共同底子：记下自己建的节点，拆的时候一起停、一起断。 */
import type { Engine, LayerBus, LayerImpl } from './engine';

export abstract class Base implements LayerImpl {
  protected c: BaseAudioContext;
  private srcs: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  constructor(protected e: Engine, protected bus: LayerBus) { this.c = e.ctx; }

  protected keep<T extends AudioNode>(n: T): T { this.nodes.push(n); return n; }
  /** 常驻的声源（建的人自己 start） */
  protected src<T extends AudioScheduledSourceNode>(n: T): T { this.srcs.push(n); this.nodes.push(n); return n; }
  protected gain(v: number): GainNode { const g = this.keep(this.c.createGain()); g.gain.value = v; return g; }
  protected filter(type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
    const b = this.keep(this.c.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }
  protected pan(p: number): StereoPannerNode { const n = this.keep(this.c.createStereoPanner()); n.pan.value = p; return n; }
  /** 实时：到了 at 之后做一件收尾的事（离线渲染不用收） */
  protected later(at: number, fn: () => void) {
    if (this.e.offline) return;
    setTimeout(fn, Math.max(0, at - this.e.now) * 1000 + 300);
  }

  abstract schedule(from: number, to: number): void;
  dispose() {
    for (const s of this.srcs) { try { s.stop(); } catch { /* 没起或已停 */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* 已断 */ } }
    this.srcs = []; this.nodes = [];
  }
}
