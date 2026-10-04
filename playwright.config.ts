import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // Software-GL tabs crash intermittently (GPU-process OOM); one retry reruns
  // in a fresh context rather than turning infra noise red.
  retries: 1,
  // Software-GL browsers are heavy; a WebGL soak test running alongside any
  // other instance starves new-context setup and flakes the suite. Serial.
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
