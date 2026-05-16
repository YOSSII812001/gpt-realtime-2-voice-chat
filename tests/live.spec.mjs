import { expect, test } from "@playwright/test";

test.describe("GPT-Realtime-2 live connection", () => {
  test("shows a live microphone level during diagnostic monitoring", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const context = new AudioContextClass();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 440;
        gain.gain.value = 0.35;
        oscillator.connect(gain);
        gain.connect(destination);
        oscillator.start();
        window.__testMicContext = context;
        window.__testMicOscillator = oscillator;
        return destination.stream;
      };
    });

    await page.goto("/");
    await page.getByRole("button", { name: "マイク診断" }).click();

    await expect(page.getByText("mic.getUserMedia:")).toBeVisible();
    await expect(page.getByText(/OK: audioTracks=\d+/)).toBeVisible();
    await expect(page.getByRole("button", { name: "診断停止" })).toBeEnabled();
    await expect
      .poll(async () => Number(await page.getByTestId("mic-level-meter").getAttribute("aria-valuenow")))
      .toBeGreaterThan(0);
    await expect(page.getByTestId("mic-level-text")).not.toHaveText("0%");

    await page.getByRole("button", { name: "診断停止" }).click();
    await expect(page.getByTestId("mic-status")).toHaveText("未接続");

    expect(consoleErrors).toEqual([]);
  });

  test("connects with a fake microphone and enables realtime controls", async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto("/");
    await page.getByRole("button", { name: "マイク診断" }).click();
    await expect(page.getByText("mic.getUserMedia:")).toBeVisible();
    await expect(page.getByText(/OK: audioTracks=\d+/)).toBeVisible();
    await expect(page.getByTestId("mic-status")).not.toHaveText("権限拒否");
    await expect(page.getByTestId("mic-level-meter")).toHaveAttribute("aria-valuenow", /\d+/);

    await page.getByRole("button", { name: "接続" }).click();

    await expect(page.getByText("Realtimeイベントチャネルが開きました。")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("GPT-Realtime-2セッションを開始しました。")).toBeVisible();
    await expect(page.getByRole("button", { name: "切断" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "マイク停止" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "送信" })).toBeEnabled();
    await expect(page.getByTestId("mic-status")).not.toHaveText("権限拒否");

    await page.getByPlaceholder("例: 今日の予定を相談したい").fill("短く一言で返事してください。");
    await page.getByRole("button", { name: "送信" }).click();
    await expect(page.getByText("user:")).toBeVisible();

    await page.getByRole("button", { name: "切断" }).click();
    await expect(page.getByTestId("connection-status")).toHaveText("未接続");

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
    await expect(page.getByTestId("mic-status")).toHaveText("権限拒否");
    await expect(page.getByTestId("mic-level-text")).toHaveText("0%");

    await page.getByRole("button", { name: "接続" }).click();

    await expect(page.getByText("マイク権限が拒否されたため、テキスト入力と音声応答のみで接続します。")).toBeVisible();
    await expect(page.getByText("Realtimeイベントチャネルが開きました。")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "マイクなし" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "送信" })).toBeEnabled();
    await expect(page.getByTestId("mic-status")).toHaveText("権限拒否");

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
