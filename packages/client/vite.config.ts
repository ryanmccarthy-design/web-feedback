import { defineConfig } from 'vite';
import path from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'PrototypeFeedback',
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        return `prototype-feedback.umd.cjs`;
      },
    },
    rollupOptions: {
      // Ensure external dependencies are bundled or mapped properly if UMD.
      // html2canvas should be bundled into UMD so standalone script tag works out-of-the-box without extra script tags!
      output: {
        globals: {
          // If un-externalized, html2canvas is bundled into dist, making script tag drop-in seamless.
        },
      },
    },
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});
