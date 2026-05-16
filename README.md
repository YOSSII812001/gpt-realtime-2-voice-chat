# GPT-Realtime-2 Voice Chat

OpenAI Realtime APIの `gpt-realtime-2` とブラウザのWebRTCを使う、ローカル確認用の最小音声チャットです。

## 構成

- `server.mjs`: Expressサーバー。`.env.local` の `OPENAI_API_KEY` を使って `/v1/realtime/calls` にSDPを中継します。
- `public/index.html`: 接続、切断、マイク停止、テキスト送信を行う画面です。
- `public/app.js`: WebRTC接続とRealtimeイベント送受信を担当します。

## セットアップ

```powershell
npm run setup
npm run dev
```

起動後、ブラウザで `http://localhost:3000` を開きます。

## 使い方

1. `接続` を押します。
2. ブラウザのマイク利用を許可します。
3. GPT-Realtime-2から挨拶が流れたら、そのまま話しかけます。
4. 必要に応じてテキスト入力からも送信できます。

マイク権限が拒否された場合は、テキスト入力と音声応答のみのモードで接続します。音声で話すには、ブラウザのサイト設定で `localhost:3000` のマイク権限を許可してから再接続してください。

`マイク診断` を押すと、現在のブラウザ権限、音声入力デバイスの検出状況、`getUserMedia()` の成否がイベントログに表示されます。`mic.permission: denied` の場合、アプリではなくブラウザ側のサイト権限でブロックされています。

## テスト

```powershell
npm run test:e2e
```

E2Eではフェイクマイクを使ってRealtime接続を確認します。実APIへ接続するため、少量のAPI料金が発生します。

## 注意

- `.env.local` の `OPENAI_API_KEY` はサーバー側だけで使い、ブラウザには渡しません。
- Realtime APIの利用にはAPI料金が発生します。
- このサンプルはローカル開発用です。公開環境に出す場合は認証、利用者ごとの `OpenAI-Safety-Identifier`、レート制限、ログ方針を追加してください。
