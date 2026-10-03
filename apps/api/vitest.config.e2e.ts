import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // One shared Postgres. Parallel files race on DishTierPrice / defaults.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
