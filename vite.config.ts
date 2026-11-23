import { defineConfig } from 'vite';
import { renderPageHtml } from './shared/site-metadata.ts';
import { parseBasePath, stripBasePath } from './shared/base-path.ts';
// BASE_PATH is read at build time (and by the server at runtime); both must use the same value.
const basePath = parseBasePath(process.env.BASE_PATH);
export default defineConfig({
  base: basePath + '/',
  plugins: [
    {
      name: 'public-page-metadata',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          if (context.path === '/scripts/social-card.html') return html;
          return renderPageHtml(
            html,
            context.server ? stripBasePath(context.path, basePath) : '/',
            undefined,
            basePath,
          );
        },
      },
    },
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  server: { host: '0.0.0.0' },
});
