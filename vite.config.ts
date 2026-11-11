import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// 空山：纯前端。模型全部由程序现场搭出来，声音全部现场合成，所以没有服务器、也没有要下载的素材。
// lab.html 是开发时看单个模型 / 听单个声音用的台子，不进正式构建。
export default defineConfig({
  // 相对路径：放在域名根下、或 GitHub Pages 那样的子目录（/kongshan/）下都能跑
  base: './',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // KS_NOHMR=1：不做热更新（截图、自动检查时用，免得别处一改文件页面就重载）
  server: { port: 3800, strictPort: true, host: true, hmr: process.env.KS_NOHMR ? false : undefined },
  preview: { port: 3800, strictPort: true, host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], react: ['react', 'react-dom'] },
      },
    },
  },
});
