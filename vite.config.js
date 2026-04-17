import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // 必要なNode.js互換機能を全て有効化
      include: ['path', 'url', 'buffer', 'events', 'util', 'stream', 'fs'],
      globals: { Buffer: true, global: true, process: true },
    })
  ]
})
