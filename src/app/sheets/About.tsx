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
          <p>没有账号，不联网存任何东西。起居注、观象册、写过的字、天时与声音的偏好，都只留在这台设备的浏览器里。</p>
        </section>
        <section>
          <h4><i>伍</i>用到的</h4>
          <p>字：马善政毛笔楷书、霞鹜文楷、思源宋体。画：three.js。历：lunar-javascript（农历与节气）。界面：React。</p>
        </section>
      </article>
    </Sheet>
  );
}
