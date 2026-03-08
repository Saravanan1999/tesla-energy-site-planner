import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test-setup.ts',
        'src/**/*.test.{ts,tsx}',
        // Full-app integration and canvas require e2e testing, not unit tests
        'src/App.tsx',
        'src/components/SiteCanvas.tsx',
        // Type-only file — interfaces erase to nothing at runtime
        'src/types/api.ts',
      ],
    },
  },
})
