import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run dev` para desarrollar; `npm run build` genera dist/index.html autocontenido
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2020' },
});
