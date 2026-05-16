import { expect, test } from "@playwright/test";

test.describe("GPT-Realtime-2 voice chat UI", () => {
  test("renders the initial UI without console errors", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "GPT-Realtime-2 Voice Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "接続" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "切断" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "マイク停止" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "マイク診断" })).toBeEnabled();
    await expect(page.getByPlaceholder("例: 今日の予定を相談したい")).toBeVisible();
    await expect(page.getByText("ready:")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("keeps controls usable on the target viewport", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "GPT-Realtime-2 Voice Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "接続" })).toBeVisible();
    await expect(page.getByRole("button", { name: "切断" })).toBeVisible();
    await expect(page.getByRole("button", { name: "マイク停止" })).toBeVisible();
    await expect(page.getByRole("button", { name: "マイク診断" })).toBeVisible();
    await expect(page.getByPlaceholder("例: 今日の予定を相談したい")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});

function collectConsoleErrors(page) {
  const messages = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      messages.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    messages.push(error.message);
  });
  return messages;
}
