/**
 * 落墨：界面上按下去的那一点晕开一滴墨（ink.css 的 .ink-bloom），很快淡去——每一枚可按的都是这一下，手指知道「按到了」。
 * 一个监听管全部（挂在最外层，捕获阶段）：按的是键、签、印、画里的小签、折起来的一段才落；画布上拖着转镜头不落。
 * 深色的键（主键、选中的签、在跑的「疾」）上落的是浅色的墨。不想看动画的（prefers-reduced-motion）不落。
 */
const PRESSABLE = 'button:not(:disabled), summary, [role="button"], .mk, .slip';
const DARK = '.key.is-main, .key.is-on, .opt.is-on, .run-key.is-on, .tag.is-on .tag-key, .hold.is-down, .ink-btn:not(.is-soft)';
const SMALL = '.mk, .tag-key, .link, .exit-link, .seg > button, .when, .menu-key, .slip, summary';

export function inkTouch(root: HTMLElement): () => void {
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)');
  const down = (e: PointerEvent) => {
    if (still && still.matches) return;
    if (e.button > 0) return;
    const t = (e.target as Element | null)?.closest?.(PRESSABLE);
    if (!t || !root.contains(t)) return;
    const b = document.createElement('i');
    b.className = `ink-bloom${t.matches(DARK) || t.closest(DARK) ? ' is-light' : ''}${t.matches(SMALL) ? ' is-small' : ''}`;
    b.setAttribute('aria-hidden', 'true');
    b.style.left = `${e.clientX}px`;
    b.style.top = `${e.clientY}px`;
    // 每一滴转个角度，不是一个模子印出来的
    b.style.setProperty('--rot', `${Math.round(Math.random() * 360)}deg`);
    root.appendChild(b);
    const done = () => b.remove();
    b.addEventListener('animationend', done, { once: true });
    setTimeout(done, 1200);
  };
  root.addEventListener('pointerdown', down, { capture: true, passive: true });
  return () => root.removeEventListener('pointerdown', down, { capture: true });
}
