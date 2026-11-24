/** 打包 / 起服务器时定下的：public/audio/xinjing.mp3 在不在（见 vite.config.ts） */
declare const __KS_HAS_XINJING__: boolean;

/**
 * 同步开关（见 src/main.tsx 与 src/app/sync/）：
 *   VITE_ANLEWO_SYNC=1 才会动态 import 同步层；不设/其它值＝完全不参与同步。
 *   VITE_ANLEWO_SYNC_API 是端点前缀，留空则用同源 /api/anlewo。
 * 两个都只从 .env.local 一类的本地文件注入，不进仓库。
 */
interface ImportMetaEnv {
  readonly VITE_ANLEWO_SYNC?: string;
  readonly VITE_ANLEWO_SYNC_API?: string;
}
