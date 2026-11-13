import { createRoot } from 'react-dom/client';
import App from './app/App';

createRoot(document.getElementById('root')!).render(<App />);

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
