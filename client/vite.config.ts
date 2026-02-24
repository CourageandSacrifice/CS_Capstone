import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'ES2020',
  },
  server: {
    host: true,
  },
  plugins: [
    {
      name: 'fix-ts-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && /\.ts(\?|$)/.test(req.url)) {
            res.setHeader('Content-Type', 'application/javascript');
          }
          next();
        });
      },
    },
  ],
});
