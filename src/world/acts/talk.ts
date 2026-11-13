/**
 * 与村里人说话：遇农夫问桑麻，遇渔樵听他们问答，遇老者、童子、采桑人、修桥人说几句家常。
 * 人走到跟前作个揖，对方停下手里的活转过身来；一句一句地说，「再问」换一句，「别过」各忙各的。
 * 话在 src/data/talk.ts（自撰的家常话）与 almanac.ts（二十四节气的农事、古书里的话）里；还没备好时用这里几句垫着。
 * 这里不问吉凶——农夫只说这个时节田里该做什么。
 */
import * as THREE from 'three';
import type { Anlewo, NpcLike } from '../Anlewo';
import type { Season } from '../env/atmos';
import { standable } from '../walk';
import type { Act } from './types';
import { reveal } from './xiang';

interface Line { id: string; who: string; when?: string[]; text: string; reply?: string }
interface Term { id: string; name: string; hou: string[]; work: string[]; quote?: { text: string; source: string } }
const DATA = import.meta.glob<Record<string, unknown>>(['../../data/talk.ts', '../../data/almanac.ts'], { eager: true });
const pick = <T,>(key: string): T | null => { for (const m of Object.values(DATA)) if (m[key]) return m[key] as T; return null; };
const LINES = pick<Line[]>('LINES') ?? [], TERMS = pick<Term[]>('TERMS') ?? [], YUQIAO = pick<Array<{ q: string; a: string; source: string }>>('YUQIAO') ?? [];

/** 文字没备好时垫着的几句 */
const SPARE: Record<string, string[]> = {
  farmer: ['先生来了。地刚翻过，趁墒情好，这两天就下种。', '春种秋收，年年如此，错不了时候就好。'],
  picker: ['桑叶要趁露水干了再采，蚕才肯吃。'], kid: ['先生，今天教的我都背下来了。', '先生晚上还教我们认星星么？'],
  elder: ['坐，坐。今年雨水匀，是个好年成。'], teacher: ['孩子们念书的声音，先生在那边也听得见吧。'],
  carpenter: ['桥板朽了两块，换了新的，再走十年不成问题。'], fisher: ['水清，鱼就少些；水浑，网又难下。都有它的道理。'],
  woodcutter: ['一担柴，够烧三天。山里的事，慢慢来。'], neighbor: ['先生吃了没有？灶上还温着粥。'],
  washer: ['水是从山口那边流下来的，清得很。'], herdboy: ['它认得路，我只管吹我的笛。'], keeper: ['新酿的，先生带一壶回去？'],
  peddler: ['针线、饴糖、小儿的拨浪鼓——先生看看？'], miller: ['一斗米舂得半个时辰，水不歇，碓也不歇。'],
  guest: ['一阳初动处，万物未生时——先生这两句，我路上想了一路。', '今日不谈别的，只看这一树花开到几分。'],
};
/** 每一季里取哪几个节气的话（农夫说的是「这个时节」） */
const SEASON_TERMS: Record<Season, string[]> = { spring: ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨'], summer: ['立夏', '小满', '芒种', '夏至', '小暑', '大暑'], autumn: ['立秋', '处暑', '白露', '秋分', '寒露', '霜降'], winter: ['立冬', '小雪', '大雪', '冬至', '小寒', '大寒'] };

const WHO: Array<{ npc: string; who: string; label: string; ask?: 'almanac' | 'yuqiao' }> = [
  { npc: 'farmer', who: 'farmer', label: '问桑麻', ask: 'almanac' }, { npc: 'picker', who: 'picker', label: '采桑人' },
  { npc: 'kid1', who: 'kid', label: '童子' }, { npc: 'kid2', who: 'kid', label: '童子' }, { npc: 'kid3', who: 'kid', label: '童子' },
  { npc: 'elder', who: 'elder', label: '老者' }, { npc: 'teacher', who: 'teacher', label: '塾师' }, { npc: 'carpenter1', who: 'carpenter', label: '修桥人' },
  { npc: 'fisher', who: 'fisher', label: '渔父', ask: 'yuqiao' }, { npc: 'woodcutter', who: 'woodcutter', label: '樵夫', ask: 'yuqiao' }, { npc: 'neighbor', who: 'neighbor', label: '邻妇' },
  { npc: 'washer', who: 'washer', label: '浣衣人' }, { npc: 'herdboy', who: 'herdboy', label: '牧童' }, { npc: 'keeper', who: 'keeper', label: '酒家' },
  { npc: 'peddler', who: 'peddler', label: '货郎' }, { npc: 'miller', who: 'miller', label: '舂米人' }, { npc: 'guest', who: 'guest', label: '客' }, { npc: 'elder2', who: 'elder', label: '弈者' },
];

function make(k: Anlewo, w: (typeof WHO)[number], npc: NpcLike): Act {
  const tmp = new THREE.Vector3();
  let turn = 0, said: string[] = [];
  /** 这会儿说得上的话：按时令、时辰筛过，打乱 */
  const lines = (): string[] => {
    const a = k.atmos, tags = new Set<string>([k.season, a.night > 0.5 ? 'night' : a.dawn > 0.4 ? 'dawn' : a.dusk > 0.4 ? 'dusk' : a.hour > 11 && a.hour < 13.5 ? 'noon' : 'day', ...(a.w.rain > 0.5 ? ['rain'] : []), ...(a.w.snow > 0.5 ? ['snow'] : []), 'any']);
    const out: string[] = LINES.filter((l) => l.who === w.who && (!l.when?.length || l.when.some((t) => tags.has(t)))).map((l) => (l.reply ? `${l.text}\n——${l.reply}` : l.text));
    if (w.ask === 'almanac') {
      // 农夫：先说这个时节田里的活，再带一句古书里的话
      const names = SEASON_TERMS[k.season], want = k.term && names.includes(k.term) ? k.term : names[Math.floor((turn / 2) % names.length)];
      const t = TERMS.find((x) => x.name === want);
      if (t) { out.unshift(`${t.name}。${t.work.join('')}`); if (t.quote) out.splice(1, 0, `「${t.quote.text}」——${t.quote.source}`); if (t.hou?.length) out.splice(2, 0, `${t.name}三候：${t.hou.join('；')}。`); }
    }
    if (w.ask === 'yuqiao') for (const y of YUQIAO) out.push(`问：${y.q}\n答：${y.a}\n——${y.source}`);
    return out.length ? out : SPARE[w.who] ?? ['……'];
  };
  const say = () => {
    if (!said.length) said = lines();
    const text = said[turn % said.length];
    act.state = { kind: 'talk', title: w.label, who: npc.name, text, choices: [{ id: 'more', label: '再问' }, { id: 'bye', label: '别过' }] };
    k.emitAct();
  };
  const act: Act & { on(): boolean } = {
    id: `talk:${w.npc}`, name: w.label,
    anchor: new THREE.Vector3(), spot: { x: npc.pos.x, z: npc.pos.z + 1.3, yaw: Math.PI },
    radius: 3.2, state: {},
    on: () => npc.present,
    enter() {
      // 家常话从随便哪一句说起（几个孩子、两位老人不至于开口都是同一句）；农夫先说时令、渔樵先问答
      turn = w.ask ? 0 : Math.floor(Math.random() * 1000); said = [];
      npc.attend(k.player.pos);
      const p = k.player, av = p.av;
      av.setHands('sleeve'); av.bow = 0.32; av.lookAt(tmp.copy(npc.pos).setY(npc.pos.y + 1.3));
      window.setTimeout(() => { if (k.act === act) av.bow = 0; }, 900);
      // 机位：两个人的侧面
      const mx = (p.pos.x + npc.pos.x) / 2, mz = (p.pos.z + npc.pos.z) / 2, dx = npc.pos.x - p.pos.x, dz = npc.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
      k.nav.setPose({ pos: new THREE.Vector3(mx - (dz / l) * 4.4, p.pos.y + 1.9, mz + (dx / l) * 4.4), look: new THREE.Vector3(mx, p.pos.y + 1.15, mz), fov: 38, yaw: 30, up: 12, down: 8 });
      say();
    },
    exit() { npc.attend(null); k.player.av.lookAt(null); k.player.av.bow = 0; },
    update() {
      // 人在动（耕田的、采桑的）：标记与站位跟着他；站在他朝着行者来的那一侧
      const p = k.player.pos, dx = p.x - npc.pos.x, dz = p.z - npc.pos.z, l = Math.hypot(dx, dz) || 1;
      let sx = npc.pos.x + (dx / l) * 1.3, sz = npc.pos.z + (dz / l) * 1.3;
      if (standable(sx, sz) == null) { sx = npc.pos.x; sz = npc.pos.z + 1.3; }
      act.spot.x = sx; act.spot.z = sz; act.spot.yaw = Math.atan2(npc.pos.x - sx, npc.pos.z - sz);
      act.anchor.set(npc.pos.x, npc.pos.y + 1.95, npc.pos.z);
    },
    cmd(name) {
      if (name === 'more') { turn++; k.sfx('page', { vel: 0.25 }); say(); }
      else if (name === 'bye' || name === 'done') {
        // 朋友讲习：与客说过话，显出「丽泽，兑」
        if (w.npc === 'guest' && turn >= 1 && !k.found.has('兑') && act.state.kind !== 'xiang') { const r = reveal(k, '兑'); act.state = { kind: 'xiang', title: '对坐', gua: r.gua, found: r.found, choices: [{ id: 'bye', label: '毕' }] }; k.emitAct(); return; }
        k.log({ kind: 'talk', text: w.label }); k.exitAct();
      }
    },
  };
  act.update!(0, 0);
  return act;
}

export function create(k: Anlewo): Act[] {
  const out: Act[] = [];
  for (const w of WHO) { const n = k.life?.npcs[w.npc]; if (n) out.push(make(k, w, n)); }
  // 人在走动：没在说话时也要每帧把标记挪到他身上
  if (out.length) k.world.tick.push(() => { for (const a of out) if (k.act !== a) a.update?.(0, 0); });
  return out;
}
