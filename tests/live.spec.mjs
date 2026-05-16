import { expect, test } from "@playwright/test";

test.describe("GPT-Realtime-2 live connection", () => {
  test("connects with a fake microphone and enables realtime controls", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto("/");
    await page.getByRole("button", { name: "マイク診断" }).click();
    await expect(page.getByText("mic.getUserMedia:")).toBeVisible();
    await expect(page.getByText(/OK: audioTracks=\d+/)).toBeVisible();

    await page.getByRole("button", { name: "接続" }).click();

    await expect(page.getByText("Realtimeイベントチャネルが開きました。")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("GPT-Realtime-2セッションを開始しました。")).toBeVisible();
    await expect(page.getByRole("button", { name: "切断" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "マイク停止" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "送信" })).toBeEnabled();

    await page.getByPlaceholder("例: 今日の予定を相談したい").fill("短く一言で返事してください。");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByText("user:")).toBeVisible();

    await page.getByRole("button", { name: "切断" }).click();
    await expect(page.getByText("未接続")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("falls back to text mode when microphone permission is denied", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      };
    });

    await page.goto("/");
    await page.getByRole("button", { name: "マイク診断" }).click();
    await expect(page.getByText("mic.getUserMedia:")).toBeVisible();
    await expect(page.getByText("NotAllowedError: マイク権限が拒否されました。")).toBeVisible();

    await page.getByRole("button", { name: "接続" }).click();

    await expect(page.getByText("マイク権限が拒否されたため、テキスト入力と音声応答のみで接続します。")).toBeVisible();
    await expect(page.getByText("Realtimeイベントチャネルが開きました。")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "マイクなし" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "送信" })).toBeEnabled();

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
