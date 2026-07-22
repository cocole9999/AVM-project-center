import { defineConfig } from 'vite';
// V1.16: 用 @vitejs/plugin-react-swc 替代默认 esbuild
//   原因: Vite 默认的 esbuild 在 HMR 重新评估时, 会把新加的 import
//        (例如 Tooltip / notification as antdNotification / wsClient) 当作"未使用" tree-shake 掉
//   SWC 编译器不优化 import, 完整保留, 避免每次 HMR 后 ReferenceError
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 9000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  // 关键: 关闭 esbuild 的依赖预构建 tree-shaking (SWC 不做这步, 但 Vite 内部仍有 esbuild)
  optimizeDeps: {
    esbuildOptions: {
      treeShaking: false,
    },
  },
});