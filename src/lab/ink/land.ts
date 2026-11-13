/** 台子上看地与水（用 &ground=0 关掉台子自带的素地）。 */
import { createLand } from '../../world/env/land';
import type { LabMake } from '../ink-lab';

const land: LabMake = ({ q, season }) => ({ obj: createLand(q, season).group, view: { az: 250, el: 12, d: 60, tx: 0, ty: 8, tz: 24 } });
export const MODELS: Record<string, LabMake> = { land };
