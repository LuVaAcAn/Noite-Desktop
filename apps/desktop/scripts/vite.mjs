import { build, createServer, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { i18nLiteralPlugin } from './i18n-literal-plugin.mjs';

const desktopRoot = fileURLToPath(new URL('..', import.meta.url));
const command = process.argv[2] ?? 'dev';
const modeArgument = process.argv.find((value, index) => process.argv[index - 1] === '--mode');
const mode = modeArgument ?? (command === 'build' ? 'production' : 'development');
const config = {
  configFile: false,
  root: desktopRoot,
  envDir: desktopRoot,
  mode,
  plugins: [i18nLiteralPlugin(), react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['TAURI_'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'oxc',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lottie-web')) return 'lottie';
          if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
};

if (command === 'build') {
  await build(config);
} else if (command === 'preview') {
  const server = await preview({ ...config, preview: { port: 1420, strictPort: true } });
  server.printUrls();
} else {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
}
