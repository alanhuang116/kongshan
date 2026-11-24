import { createRoot } from 'react-dom/client';
import App from './app/App';

createRoot(document.getElementById('root')!).render(<App />);

// 同步（存档 + 笔迹）：关着的时候这一行什么都不做——连这个模块都不会加载
if (import.meta.env.VITE_ANLEWO_SYNC === '1') void import('./app/sync').then((m) => m.start());

// 首页五连击调试面板：仅开发态加载；正式构建两个条件都为假，整块连模块一起被摇掉
if (import.meta.env.DEV || import.meta.env.VITE_ANLEWO_DEV === '1') void import('./app/sync/devtools').then((m) => m.mount());

// 正式版才装离线缓存（开发时会碍事）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 路径都相对页面所在的目录（可能在子目录下）
    const home = new URL('./', location.href).href;
    void navigator.serviceWorker.register(new URL('sw.js', home).href).then(() => navigator.serviceWorker.ready).then((reg) => {
      // 头一回来时，页面与脚本是在缓存装好之前取的：把已经取过的同源文件报给它补存一遍，这样第一次来过之后断网也进得来
      const warm = () => reg.active?.postMessage({ type: 'warm', urls: [...new Set([home, ...performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin))])] });
      warm(); setTimeout(warm, 15000);
    }).catch(() => { /* 装不上就在线用 */ });
  });
}
