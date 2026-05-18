import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import express from "express";

dotenv.config({ path: ".env.local" });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;
const sheetsConfig = {
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "1aPIcxEh9E7qtDEJ0ML9olwgOb7ufHQH-kMMzEeqJILY",
  sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || "シート1",
  residentsSheetName: process.env.GOOGLE_SHEETS_RESIDENTS_SHEET_NAME || "入居者マスタ",
  recordersSheetName: process.env.GOOGLE_SHEETS_RECORDERS_SHEET_NAME || "記入者マスタ"
};

const defaultResidents = [
  { name: "山田 太郎", reading: "やまだ たろう", aliases: ["山田太郎", "やまださん", "山田さん"] },
  { name: "佐藤 花子", reading: "さとう はなこ", aliases: ["佐藤花子", "さとうさん", "佐藤さん"] },
  { name: "鈴木 一郎", reading: "すずき いちろう", aliases: ["鈴木一郎", "すずきさん", "鈴木さん"] },
  { name: "高橋 美咲", reading: "たかはし みさき", aliases: ["高橋美咲", "たかはしさん", "高橋さん"] },
  { name: "田中 健", reading: "たなか けん", aliases: ["田中健", "たなかさん", "田中さん"] },
  { name: "伊藤 直子", reading: "いとう なおこ", aliases: ["伊藤直子", "いとうさん", "伊藤さん"] },
  { name: "渡辺 翔", reading: "わたなべ しょう", aliases: ["渡辺翔", "わたなべさん", "渡辺さん"] },
  { name: "小林 愛", reading: "こばやし あい", aliases: ["小林愛", "こばやしさん", "小林さん"] },
  { name: "加藤 大輔", reading: "かとう だいすけ", aliases: ["加藤大輔", "かとうさん", "加藤さん"] },
  { name: "吉田 彩", reading: "よしだ あや", aliases: ["吉田彩", "よしださん", "吉田さん"] }
];

const defaultRecorders = [
  { name: "ヨッシー", reading: "よっしー", aliases: ["Yoshi", "吉田", "よしだ", "ヨシ", "ヨッシーさん"] },
  { name: "Rabbit", reading: "らびっと", aliases: ["ラビット", "rabbit", "Rabbitさん"] },
  { name: "佐藤", reading: "さとう", aliases: ["佐藤さん", "さとうさん"] },
  { name: "田中", reading: "たなか", aliases: ["田中さん", "たなかさん"] },
  { name: "吉田", reading: "よしだ", aliases: ["吉田さん", "よしださん"] },
  { name: "鈴木", reading: "すずき", aliases: ["鈴木さん", "すずきさん"] },
  { name: "高橋", reading: "たかはし", aliases: ["高橋さん", "たかはしさん"] },
  { name: "伊藤", reading: "いとう", aliases: ["伊藤さん", "いとうさん"] },
  { name: "渡辺", reading: "わたなべ", aliases: ["渡辺さん", "わたなべさん"] },
  { name: "小林", reading: "こばやし", aliases: ["小林さん", "こばやしさん"] }
];

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ type: "application/json", limit: "1mb" }));
app.use(express.text({ type: ["application/sdp", "text/plain"], limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    model: "gpt-realtime-2",
    hasOpenAIKey: Boolean(apiKey),
    sheets: {
      spreadsheetId: sheetsConfig.spreadsheetId,
      sheetName: sheetsConfig.sheetName,
      residentsSheetName: sheetsConfig.residentsSheetName,
      recordersSheetName: sheetsConfig.recordersSheetName,
      hasCredentials: hasGoogleSheetsCredentials()
    }
  });
});

app.get("/residents", async (req, res) => {
  try {
    const residents = await readResidentsMaster();
    res.json({ ok: true, residents });
  } catch (error) {
    res.status(500).json({ error: "入居者マスタの読み込みに失敗しました。", detail: error.message });
  }
});

app.get("/recorders", async (req, res) => {
  try {
    const recorders = await readRecordersMaster();
    res.json({ ok: true, recorders });
  } catch (error) {
    res.status(500).json({ error: "記入者マスタの読み込みに失敗しました。", detail: error.message });
  }
});

app.post("/entries", async (req, res) => {
  const entry = await normalizeEntry(req.body || {});

  if (!entry.name || !entry.recorder) {
    res.status(400).json({ error: "氏名と記入者は必須です。", entry });
    return;
  }

  if (!entry.move_in_time && !entry.move_out_time) {
    res.status(400).json({ error: "入居時刻または退居時刻のどちらかは必須です。", entry });
    return;
  }

  try {
    const result = await appendResidencyEntry(entry);
    res.json({ ok: true, entry, result });
  } catch (error) {
    console.error("Failed to append residency entry:", error);
    res.status(500).json({
      error: "Google Sheets への追記に失敗しました。",
      detail: error.message,
      entry
    });
  }
});

app.post("/session", async (req, res) => {
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
    return;
  }

  if (!req.body || typeof req.body !== "string") {
    res.status(400).json({ error: "Expected an SDP offer in the request body." });
    return;
  }

  const formData = new FormData();
  formData.set("sdp", req.body);
  formData.set("session", await buildSessionConfig());

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": "local-dev-user"
      },
      body: formData
    });

    const body = await upstream.text();

    if (!upstream.ok) {
      console.error(`Realtime session failed: ${upstream.status} ${body}`);
      res.status(upstream.status).type("application/json").send(
        JSON.stringify({
          error: "Failed to create a realtime session.",
          status: upstream.status,
          detail: safeOpenAIError(body)
        })
      );
      return;
    }

    res.status(200).type("application/sdp").send(body);
  } catch (error) {
    console.error("Realtime session error:", error);
    res.status(500).json({ error: "Failed to create a realtime session." });
  }
});

app.listen(port, () => {
  console.log(`GPT-Realtime-2 voice chat: http://localhost:${port}`);
});

async function normalizeEntry(raw) {
  const entry = {
    name: String(raw.name || raw.full_name || "").trim(),
    move_in_time: String(raw.move_in_time || raw.moveInTime || "").trim(),
    move_out_time: String(raw.move_out_time || raw.moveOutTime || "").trim(),
    recorder: String(raw.recorder || raw.created_by || "").trim()
  };

  try {
    const residents = await readResidentsMaster();
    const matchedResident = matchResident(entry.name, residents);
    if (matchedResident) {
      entry.name = matchedResident.name;
    }
  } catch (error) {
    console.warn("Failed to canonicalize resident name:", error.message);
  }

  try {
    const recorders = await readRecordersMaster();
    const matchedRecorder = matchResident(entry.recorder, recorders);
    if (matchedRecorder) {
      entry.recorder = matchedRecorder.name;
    }
  } catch (error) {
    console.warn("Failed to canonicalize recorder name:", error.message);
  }

  return entry;
}

async function buildSessionConfig() {
  const residents = await readResidentsMaster().catch((error) => {
    console.warn("Failed to load residents master for realtime session:", error.message);
    return defaultResidents;
  });
  const today = getTodayInTimeZone();
  const recorders = await readRecordersMaster().catch((error) => {
    console.warn("Failed to load recorders master for realtime session:", error.message);
    return defaultRecorders;
  });

  const residentList = residents
    .map((resident) => {
      const aliases = resident.aliases.length ? ` / 別名: ${resident.aliases.join("、")}` : "";
      return `- ${resident.name}（${resident.reading || "読み未設定"}${aliases}）`;
    })
    .join("\n");
  const recorderList = recorders
    .map((recorder) => {
      const aliases = recorder.aliases.length ? ` / 別名: ${recorder.aliases.join("、")}` : "";
      return `- ${recorder.name}（${recorder.reading || "読み未設定"}${aliases}）`;
    })
    .join("\n");

  return JSON.stringify({
    type: "realtime",
    model: "gpt-realtime-2",
    instructions: `あなたは入退居記録を支援する日本語の音声受付です。
現在の基準日は Asia/Tokyo で ${today} です。「今日」と言われたら必ず ${today} として扱ってください。「明日」「昨日」もこの基準日から計算してください。
ユーザーが入居・退居の記録を依頼したら、内容を確認し、氏名、入居時刻、退居時刻、記入者を抽出してください。
氏名は必ず次の入居者マスタから最も近い正式氏名を選んでください。聞き取りが曖昧で1人に絞れない場合は、候補を短く確認してください。
記入者も必ず次の記入者マスタから最も近い正式名を選んでください。聞き取りが曖昧で1人に絞れない場合は、候補を短く確認してください。

入居者マスタ:
${residentList}

記入者マスタ:
${recorderList}

入居だけの場合は退居時刻を空文字にしてください。退居だけの場合は入居時刻を空文字にしてください。
時刻は可能な限り YYYY/MM/DD HH:mm 形式に正規化してください。日付が不明な場合は今日として扱ってよいか短く確認してください。
必要な情報がそろったら record_residency_entry ツールを呼び出してください。
ツール実行後は、記録した正式氏名と時刻を短く復唱してください。`,
    audio: {
      output: {
        voice: "marin"
      }
    },
    tools: [
      {
        type: "function",
        name: "record_residency_entry",
        description: "Google Sheets の入退居記録テンプレートに1行追記する。氏名は入居者マスタ、記入者は記入者マスタ上の正式名を指定する。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "入居者マスタ上の正式氏名" },
            move_in_time: { type: "string", description: "入居時刻。未入力なら空文字。推奨形式 YYYY/MM/DD HH:mm" },
            move_out_time: { type: "string", description: "退居時刻。未入力なら空文字。推奨形式 YYYY/MM/DD HH:mm" },
            recorder: { type: "string", description: "記入者マスタ上の正式名" }
          },
          required: ["name", "move_in_time", "move_out_time", "recorder"],
          additionalProperties: false
        }
      }
    ],
    tool_choice: "auto"
  });
}

function getTodayInTimeZone(timeZone = "Asia/Tokyo") {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day}`;
}

async function readResidentsMaster() {
  return readPeopleMaster(sheetsConfig.residentsSheetName, defaultResidents);
}

async function readRecordersMaster() {
  return readPeopleMaster(sheetsConfig.recordersSheetName, defaultRecorders);
}

async function readPeopleMaster(sheetName, fallbackPeople) {
  if (!sheetsConfig.spreadsheetId || !hasGoogleSheetsCredentials()) {
    return fallbackPeople;
  }

  const accessToken = await getGoogleAccessToken();
  const range = `${quoteSheetName(sheetName)}!A2:D200`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetsConfig.spreadsheetId)}/values/${encodeURIComponent(range)}`
  );

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Sheets API ${response.status}: ${safeOpenAIError(body)}`);
  }

  const rows = JSON.parse(body).values || [];
  const residents = rows
    .map(([name = "", reading = "", aliases = "", memo = ""]) => ({
      name: String(name).trim(),
      reading: String(reading).trim(),
      aliases: splitAliases(aliases),
      memo: String(memo).trim()
    }))
    .filter((resident) => resident.name);

  return residents.length ? residents : fallbackPeople;
}

function splitAliases(value) {
  return String(value || "")
    .split(/[、,]/)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function matchResident(inputName, residents) {
  const normalizedInput = normalizeNameForMatch(inputName);
  if (!normalizedInput) {
    return undefined;
  }

  return residents.find((resident) => {
    const candidates = [resident.name, resident.reading, ...resident.aliases];
    return candidates.some((candidate) => normalizeNameForMatch(candidate) === normalizedInput);
  });
}

function normalizeNameForMatch(value) {
  return String(value || "")
    .replace(/[\s　・]/g, "")
    .replace(/さん$/u, "")
    .toLowerCase();
}

async function appendResidencyEntry(entry) {
  if (!sheetsConfig.spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
  }

  const accessToken = await getGoogleAccessToken();
  const range = `${quoteSheetName(sheetsConfig.sheetName)}!A:D`;
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetsConfig.spreadsheetId)}/values/${encodeURIComponent(range)}:append`
  );
  url.searchParams.set("valueInputOption", "USER_ENTERED");
  url.searchParams.set("insertDataOption", "INSERT_ROWS");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [[entry.name, entry.move_in_time, entry.move_out_time, entry.recorder]]
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Sheets API ${response.status}: ${safeOpenAIError(body)}`);
  }

  return JSON.parse(body);
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName || "シート1").replaceAll("'", "''")}'`;
}

function hasGoogleSheetsCredentials() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GOOGLE_ACCESS_TOKEN
  );
}

async function getGoogleAccessToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return process.env.GOOGLE_ACCESS_TOKEN;
  }

  const serviceAccount = await loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    },
    serviceAccount.private_key
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Google OAuth ${response.status}: ${json.error_description || json.error || "unknown error"}`);
  }

  return json.access_token;
}

async function loadServiceAccount() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const json = await fs.readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
    return JSON.parse(json);
  }

  throw new Error(
    "Google Sheets credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_ACCESS_TOKEN."
  );
}

function signJwt(header, payload, privateKey) {
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createSign("RSA-SHA256").update(input).sign(privateKey);
  return `${input}.${base64url(signature)}`;
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function safeOpenAIError(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || parsed.error || parsed;
  } catch {
    return String(body).slice(0, 500);
  }
}
