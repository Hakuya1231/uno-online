import { test, expect } from "@playwright/test";

function parseRoomIdFromUrl(url: string): string {
  const m = url.match(/\/room\/([^/?#]+)/);
  if (!m) throw new Error(`无法从 URL 解析 roomId：${url}`);
  return m[1]!.toUpperCase();
}

test.describe("房间模块 E2E", () => {
  test("用例1：首页自动登录 + 创建房间跳转成功", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("正在进入系统...")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText("已登录：")).toBeVisible({ timeout: 30_000 });

    // 填一个固定昵称，避免按钮禁用（不依赖 data-testid，兼容线上旧版本）
    await page.getByLabel("昵称").fill(`房主_${Date.now()}`);

    await page.getByRole("button", { name: "创建房间" }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+/);

    await expect(page.getByText("玩家列表")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("房间订阅错误")).toHaveCount(0);
  });

  test("用例2+3：分享链接直达加入 + 房主开始后双方跳转", async ({ browser }) => {
    // Host context
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await hostPage.goto("/");
    await expect(hostPage.getByText("已登录：")).toBeVisible({ timeout: 30_000 });
    await hostPage.getByLabel("昵称").fill(`房主_${Date.now()}`);
    await hostPage.getByRole("button", { name: "创建房间" }).click();
    await expect(hostPage).toHaveURL(/\/room\/[A-Z0-9]+/);

    const roomId = parseRoomIdFromUrl(hostPage.url());
    await expect(hostPage.getByText("玩家列表")).toBeVisible();

    // Player2 context: direct open room link
    const p2Ctx = await browser.newContext();
    const p2Page = await p2Ctx.newPage();
    await p2Page.goto(`/room/${roomId}`);
    await expect(p2Page.getByText("玩家列表")).toBeVisible();

    // Join with nickname
    const p2Name = `玩家2_${Date.now()}`;
    await p2Page.getByLabel("昵称").fill(p2Name);

    await p2Page.getByRole("button", { name: "加入房间" }).click();
    await expect(p2Page.getByText("你已加入房间，等待房主开始游戏…")).toBeVisible();

    // After join, nickname component should be hidden
    await expect(p2Page.getByLabel("昵称")).toHaveCount(0);

    // Both pages should show 2 players eventually
    await expect(hostPage.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });
    await expect(p2Page.getByRole("listitem")).toHaveCount(2, { timeout: 30_000 });

    // Host starts game; both should navigate to /game/[roomId]
    await hostPage.getByRole("button", { name: "开始游戏" }).click();
    await expect(hostPage).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 30_000 });
    await expect(p2Page).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 30_000 });

    await hostCtx.close();
    await p2Ctx.close();
  });
});

