import { openSheet } from '../ks';
import { WORDS } from '../texts';
import Sheet from './Sheet';

/**
 * 关于：这里是什么（WORDS.about）；另起一节、分得清清楚楚地说哪些是古人的原话、哪些是本应用自己的话（WORDS.honest）；
 * 再是怎么做出来的与用到的东西。文字在 src/data/talk.ts。
 */
export default function About() {
  return (
    <Sheet title="关于" wide>
      <article className="about">
        <section>
          <h4><i>壹</i>{WORDS.title}</h4>
          <p className="lead">{WORDS.subtitle}</p>
          {WORDS.about.map((p, i) => <p key={i}>{p}</p>)}
          <p className="about-guide">
            <button className="link" onClick={() => { openSheet(null); window.dispatchEvent(new Event('ks:guide')); }} data-testid="about-guide">怎么玩：再看一遍「初到」</button>
            <button className="link" onClick={() => openSheet('today')} data-testid="about-today">今天能做什么：「今日」</button>
          </p>
        </section>
        <section className="about-honest">
          <h4><i>贰</i>哪些是原话</h4>
          {WORDS.honest.map((p, i) => <p key={i}>{p}</p>)}
        </section>
        <section>
          <h4><i>叁</i>都是现画、现算的</h4>
          <p>这里的每一座山、每一株桃、每一间屋、每一个人，都是程序一笔一笔现画出来的；每一声溪水、鸟鸣、鸡犬与读书声，都是现算出来的。没有一张照片、一个现成的模型、一张贴图、一段录音。</p>
          <p>画法学的是浅绛与小青绿山水：近处淡彩，远景水墨，天与水留白。</p>
        </section>
        <section>
          <h4><i>肆</i>只在这台设备上</h4>
          <p>没有账号，不联网存任何东西。起居注、观象册、写过的字、行囊与田里的收成、与村里人的情分、天时与声音的偏好，都只留在这台设备的浏览器里。</p>
          <p>「同游」开着时，同在园里的人互相看得见：传出去的只有：你此刻在哪、朝哪、在做哪件事（走着、坐着、抚琴……），一个随手起的雅号与衣色，还有作揖与几句现成的问候。经一台中转转给同在园里的人，不记下来，也没有账号。不想被人看见，点开「同游」选「独游」。天时、季节、晴雨还是各人自己的。</p>
        </section>
        <section>
          <h4><i>伍</i>用到的</h4>
          <p>字：马善政毛笔楷书、霞鹜文楷、思源宋体。画：three.js。历：lunar-javascript（农历与节气）。界面：React。</p>
          <p>星：星表用依巴谷星表（ESA 1997，经 CDS）；星官连线与星名据 Stellarium 天空文化「chinese」（CC BY-SA）；三垣二十八宿的分属参考中文维基百科（CC BY-SA）。据此整理的星官表（源码里的 src/data/xingguan.ts）按 CC BY-SA 4.0 发布。</p>
        </section>
      </article>
    </Sheet>
  );
}
