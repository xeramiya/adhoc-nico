# アドホック・ニコ

React RouterとPartyKitで作るリアルタイムコメントオーバーレイ（ニコニコ風）アプリ。

- 本番ドメイン: `adhoc-nico.uebit.net`
- フロントエンド: React Router (SSR)
- リアルタイム基盤: PartyKit (`party/session.ts`)
- ブラウザ拡張: `firefox-addon/`（任意のページにコメントをオーバーレイ表示）

## セットアップ

依存関係をインストール:

```bash
pnpm install
```

## 開発

HMR付きの開発サーバー（React Router + PartyKit + HTTPSプロキシ）を起動:

```bash
pnpm dev
```

- アプリ: `https://localhost:3443/`（同一LAN内の他端末からは`https://<LAN IP>:3443/`）
- PartyKit devサーバー: `localhost:1999`

## 環境変数

本番のPartyKitホストは環境変数で指定する。`.env`に以下を設定:

```
VITE_PARTY_HOST=adhoc-nico.uebit.net
```

開発時（localhostやプライベートIP）では自動的に現在のホストへ接続するため、設定は不要。

## ビルド

```bash
pnpm build
```

## デプロイ

PartyKitへデプロイする（カスタムドメインは`partykit.json`の`domain`で`adhoc-nico.uebit.net`を指定済み）:

```bash
npx partykit deploy
```

`main`ブランチへのpushでGitHub Actions（`.github/workflows/deploy-partykit.yml`）が自動デプロイする。

## Firefox拡張

`firefox-addon/`を`about:debugging`から一時的に読み込む。接続先ホストは`firefox-addon/config.js`の`ADHOC_NICO_HOST`で設定する。ポップアップでセッションIDを入力して接続すると、現在のタブにコメントがオーバーレイ表示される。
