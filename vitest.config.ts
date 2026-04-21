import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright E2E 测试放在 /tests，避免被 Vitest 当成单元测试执行
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "tests/**"],
  },
});

