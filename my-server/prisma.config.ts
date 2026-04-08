import path from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 doesn't auto-load .env files in prisma.config.ts,
// so we read and inject them manually for CLI commands (db push, migrate, etc.).
// At runtime the Docker container supplies env vars directly.
function loadDotEnv() {
  try {
    const file = readFileSync(path.join(process.cwd(), '.env'), 'utf-8');
    for (const line of file.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env not present (production Docker) — env vars are supplied by the host
  }
}

loadDotEnv();

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // directUrl (non-pooled) is required for migrate / db push
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
