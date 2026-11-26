/**
 * 六样玩法的榜（play/board.ts）：射箭、蹴鞠、斗鸡、绕村一圈、投壶、打水漂。名字、成绩怎么说、村里人各几分，都在这里登记——
 * 一个人玩时榜上也有人可追。成绩一律是整数：几筹、几脚、胜几场、几秒、几筭、漂几下。
 * 这个模块一载入就登记（各样玩法的文件 import 它）；投壶、打水漂那两个文件只管 report。
 */
import { cnNum } from '../kit';
import { registerBoard } from '../board';

/** 几秒说成「三分十秒」 */
export const secsText = (v: number) => { const m = Math.floor(v / 60), s = Math.round(v % 60); return m ? `${cnNum(m)}分${s ? `${cnNum(s)}秒` : ''}` : `${cnNum(s)}秒`; };

registerBoard({
  key: 'archery', name: '射箭', order: 10, fmt: (v) => `${cnNum(v)}筹`,
  note: '村塾东边的射圃，四矢一轮：中鹄三筹，中正二筹，中侯一筹。一轮最多十二筹',
  folk: [['赵先生', 10], ['小乙', 8], ['二郎', 6], ['柱子', 5]],
});
registerBoard({
  key: 'cuju', name: '蹴鞠', order: 11, fmt: (v) => `${cnNum(v)}脚`,
  note: '门前明堂的草地上白打，二人对踢：两人连踢不坠，共几脚',
  folk: [['小乙', 41], ['二郎', 33], ['柱子', 26], ['虎子', 17]],
});
registerBoard({
  key: 'cock', name: '斗鸡', order: 12, fmt: (v) => `胜${cnNum(v)}场`,
  note: '土地庙南边的空地上斗鸡，借二郎的鸡：一共胜过几场',
  folk: [['孙掌柜', 12], ['钱三', 8], ['二郎', 5]],
});
registerBoard({
  key: 'ride', name: '绕村一圈', order: 13, low: true, fmt: secsText,
  note: '骑牛（牛棚）或骑驴（碓房东头），绕井、大槐树、村塾、碓房、洗衣埠、土地庙一圈回来，用时少的在前',
  folk: [['牛儿', 158], ['二郎', 176], ['柱子', 191]],
});
registerBoard({
  key: 'pitchpot', name: '投壶', order: 14, fmt: (v) => `${cnNum(v)}筭`,
  note: '院里石桌西南，十二支矢一局，照司马光《投壶新格》计筭',
  folk: [['郑先生', 116], ['赵先生', 78], ['李公', 55]],
});
registerBoard({
  key: 'skip', name: '打水漂', order: 15, fmt: (v) => `漂${cnNum(v)}下`,
  note: '渡口栈桥头，一块石子在伊水上点了几下',
  folk: [['老许', 14], ['虎子', 9], ['石头', 6]],
});
