/** 环境层的工厂：按名字建一层。 */
import { Chant } from './chant';
import type { Engine, LayerBus, LayerImpl } from './engine';
import { BellFar, Birds, Eaves, Insects, Rain, Stream, Wind } from './nature';
import { Qin } from './qin';
import type { Layer } from './types';

export function createLayer(l: Layer, e: Engine, bus: LayerBus, t: number): LayerImpl {
  switch (l) {
    case 'wind': return new Wind(e, bus, t);
    case 'birds': return new Birds(e, bus, t);
    case 'stream': return new Stream(e, bus, t);
    case 'rain': return new Rain(e, bus, t);
    case 'insects': return new Insects(e, bus, t);
    case 'chant': return new Chant(e, bus, t);
    case 'qin': return new Qin(e, bus, t);
    case 'bellfar': return new BellFar(e, bus, t);
    case 'eaves': return new Eaves(e, bus, t);
  }
}
