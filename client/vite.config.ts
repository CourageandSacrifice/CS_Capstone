import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'ES2020',
  },
  server: {
    host: true,
    headers: {
      '*.ts': {
        'Content-Type': 'application/javascript',
      },
    },
  },
  plugins: [
    {
      name: 'fix-ts-mime',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          const originalSetHeader = res.setHeader.bind(res);
          res.setHeader = (name: string, value: string | string[]) => {
            if (
              name.toLowerCase() === 'content-type' &&
              typeof value === 'string' &&
              value.includes('video/vnd.dlna.mpeg-tts')
            ) {
              return originalSetHeader(name, 'application/javascript');
            }
            return originalSetHeader(name, value);
          };
          next();
        });
      },
    },
  ],
});
