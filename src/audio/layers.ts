/** 层的工厂：按名字建一层（环境的底、一直响着的声音、旧的四层）。 */
import { Chant } from './chant';
import type { Engine, LayerBus, LayerImpl } from './engine';
import { Birds, Cicadas, Crickets, Frogs, Geese, Swallows } from './fauna';
import { Kettle, Mill, Repeat, School, Village, Work } from './life';
import { BellFar, Eaves } from './nature';
import { Qin } from './qin';
import type { SlotId } from './types';
import { Brook, Pond, River, Waterfall } from './waters';
import { Drips, Night, Rain, Snow } from './weather';
import { Air, Bamboo, FieldWind, Leaves, Pines } from './winds';

export function createLayer(l: SlotId, e: Engine, bus: LayerBus, t: number): LayerImpl {
  switch (l) {
    case 'air': return new Air(e, bus, t);
    case 'pines': return new Pines(e, bus, t);
    case 'bamboo': return new Bamboo(e, bus, t);
    case 'leaves': return new Leaves(e, bus, t);
    case 'fieldwind': return new FieldWind(e, bus, t);
    case 'brook': return new Brook(e, bus, t);
    case 'pond': return new Pond(e, bus, t);
    case 'river': return new River(e, bus, t);
    case 'waterfall': return new Waterfall(e, bus, t);
    case 'birds': return new Birds(e, bus, t);
    case 'swallows': return new Swallows(e, bus, t);
    case 'cicadas': return new Cicadas(e, bus, t);
    case 'frogs': return new Frogs(e, bus, t);
    case 'crickets': return new Crickets(e, bus, t);
    case 'geese': return new Geese(e, bus, t);
    case 'rain': return new Rain(e, bus, t);
    case 'drips': return new Drips(e, bus, t);
    case 'snow': return new Snow(e, bus, t);
    case 'night': return new Night(e, bus, t);
    case 'village': return new Village(e, bus, t);
    case 'school': return new School(e, bus, t);
    case 'work': return new Work(e, bus, t);
    case 'mill': return new Mill(e, bus, t);
    case 'kettle': return new Kettle(e, bus, t);
    case 'inkstone': case 'saw': case 'plough': return new Repeat(e, bus, t, l);
    // 旧的四层
    case 'chant': return new Chant(e, bus, t);
    case 'qin': return new Qin(e, bus, t);
    case 'bellfar': return new BellFar(e, bus, t);
    case 'eaves': return new Eaves(e, bus, t);
  }
}
