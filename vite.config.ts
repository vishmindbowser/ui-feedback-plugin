import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({ include: ['src'], rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'UIFeedbackPlugin',
      fileName: (format) => `ui-feedback-plugin.${format}.js`,
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: [],
    },
    sourcemap: true,
    minify: 'esbuild',
  },
})
