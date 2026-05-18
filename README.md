# GPT-Realtime-2 Voice Chat

OpenAI Realtime APIの `gpt-realtime-2` とブラウザのWebRTCを使う、入退居記録をGoogle Sheetsへ追記する最小音声チャットです。

## 構成

- `server.mjs`: Expressサーバー。`.env.local` の `OPENAI_API_KEY` を使って `/v1/realtime/calls` にSDPを中継し、入居者マスタを読み込んだうえで `/entries` からGoogle Sheetsへ追記します。
- `public/index.html`: 接続、切断、マイク停止、テキスト送信を行う画面です。
- `public/app.js`: WebRTC接続、Realtimeイベント送受信、`record_residency_entry` tool呼び出し結果のSheets追記を担当します。

## セットアップ

```powershell
npm run setup
npm run dev
```

起動後、ブラウザで `http://localhost:3000` を開きます。

## Google Sheets設定

`.env.local` に追記先を設定します。

```powershell
GOOGLE_SHEETS_SPREADSHEET_ID=1aPIcxEh9E7qtDEJ0ML9olwgOb7ufHQH-kMMzEeqJILY
GOOGLE_SHEETS_SHEET_NAME=シート1
GOOGLE_SHEETS_RESIDENTS_SHEET_NAME=入居者マスタ
GOOGLE_SHEETS_RECORDERS_SHEET_NAME=記入者マスタ
```

認証は以下のいずれかを設定します。

```powershell
# 推奨: サービスアカウントJSON。事前にスプレッドシートを client_email に共有してください。
GOOGLE_SERVICE_ACCOUNT_JSON={...}

# またはサービスアカウントJSONファイルパス
GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json

# または一時的なOAuthアクセストークン
GOOGLE_ACCESS_TOKEN=ya29...
```

追記先シートの列は以下の仮テンプレートです。

| A | B | C | D |
|---|---|---|---|
| 氏名 | 入居時刻 | 退居時刻 | 記入者 |

入居者マスタ用に `入居者マスタ` シート、記入者マスタ用に `記入者マスタ` シートも参照します。どちらも列は以下です。

| A | B | C | D |
|---|---|---|---|
| 氏名 | 読み | 表記ゆれ | メモ |

Realtimeセッション開始時にこれらのマスタを読み込み、音声入力で聞き取った入居者名・記入者名を正式名に寄せます。`/entries` 側でも完全一致・空白違い・表記ゆれの範囲で正式名へ補正します。

## 使い方

1. `接続` を押します。
2. ブラウザのマイク利用を許可します。
3. GPT-Realtime-2から挨拶が流れたら、そのまま話しかけます。
4. 必要に応じてテキスト入力からも送信できます。

入力例:

```text
山田太郎さんが10時に入居、記入者は佐藤です
佐藤花子さんが18時に退居、記入者は田中です
```

情報がそろうと、GPT-Realtime-2 が入居者マスタ・記入者マスタ上の正式名で `record_residency_entry` toolを呼び出し、サーバーの `/entries` 経由でGoogle Sheetsに1行追記します。

マイク権限が拒否された場合は、テキスト入力と音声応答のみのモードで接続します。音声で話すには、ブラウザのサイト設定で `localhost:3000` のマイク権限を許可してから再接続してください。

`マイク診断` を押すと、現在のブラウザ権限、音声入力デバイスの検出状況、`getUserMedia()` の成否がイベントログに表示されます。`mic.permission: denied` の場合、アプリではなくブラウザ側のサイト権限でブロックされています。

`マイク入力` のステータスUIでは、実マイクが取得できた場合に入力音量を0-100%で表示します。`マイク診断` を押すと連続メーターが開始し、もう一度押すと停止します。権限が拒否されている場合は `権限拒否` と0%が表示されます。

## テスト

```powershell
npm run test:e2e
```

E2Eではフェイクマイクを使ってRealtime接続を確認します。実APIへ接続するため、少量のAPI料金が発生します。

Sheets追記APIだけを確認する場合:

```powershell
curl -X POST http://localhost:3000/entries `
  -H "Content-Type: application/json" `
  -d '{"name":"テスト 太郎","move_in_time":"2026/05/18 10:00","move_out_time":"","recorder":"ヨッシー"}'
```

Google認証が未設定の場合、このAPIは認証エラーになります。

## 注意

- `.env.local` の `OPENAI_API_KEY` はサーバー側だけで使い、ブラウザには渡しません。
- Realtime APIの利用にはAPI料金が発生します。
- このサンプルはローカル開発用です。公開環境に出す場合は認証、利用者ごとの `OpenAI-Safety-Identifier`、レート制限、ログ方針を追加してください。
