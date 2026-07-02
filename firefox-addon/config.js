// アドオン全体（background / content / popup）で共有する設定・定数・ヘルパー。
// manifest.jsonで各コンテキストの先頭に読み込まれる。
const ADHOC_NICO_HOST = "adhoc-nico.uebit.net";

// 以下の定数はアプリ本体と揃えている:
// app/lib/protocol.ts (WAVE_PATTERNS, NEON_COLORS) /
// app/components/comment-canvas.tsx (アニメーション時間・フォント・レーン高)
const ANIMATION_DURATION_MS = 8000;
const SAFETY_GAP_MS = 300;
const LANE_HEIGHT_PX = 48;
const COMMENT_FONT_PX = 40;
const NICO_FONT_FAMILY =
  '"游ゴシック体", YuGothic, "游ゴシック", "Yu Gothic", "ヒラギノ角ゴ Pro", "Hiragino Kaku Gothic Pro", "メイリオ", Meiryo, "MS PGothic", sans-serif';
const WAVE_PATTERNS = [
  "下广卞廿十亠卉与本二上旦上二本与卉亠十廿卞广",
  "▁▂▃▅▆▇▇▆▅▃▂▁",
  "➫➙➬➭➫➙➬➮➪",
  "↗⁀↘‿↗⁀↘‿",
];
const NEON_COLORS = [
  "#FF00FF", "#00FFFF", "#39FF14", "#FF6600", "#FF0099",
  "#FFFF00", "#00FF99", "#FF3366", "#9933FF", "#00CCFF",
];

// app/lib/utils.ts isLocalHostnameと同じ判定
function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function isLocalAdhocHost() {
  return isLocalHostname(ADHOC_NICO_HOST.split(":")[0]);
}

// 管理画面からのpostMessage同期を受け付けるorigin判定。
// 本番はhttpsの完全一致のみ、開発時はローカルアドレスを許可する。
function isAllowedSyncOrigin(origin) {
  if (origin === "https://" + ADHOC_NICO_HOST) return true;
  try {
    return isLocalHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

// app/lib/utils.ts parseColorCommandと同等の「/色名 本文」解釈。
// CSSの色名一覧を持ち込む代わりにCSS.supportsで判定する
const NON_COLOR_KEYWORDS = new Set(["transparent", "currentcolor", "inherit", "initial", "unset", "revert"]);

function parseColorCommand(text) {
  const m = /^\/(\S+)\s(.+)/.exec(text);
  if (m) {
    const word = m[1].toLowerCase();
    if (
      /^[a-z]+$/.test(word) &&
      !NON_COLOR_KEYWORDS.has(word) &&
      typeof CSS !== "undefined" &&
      CSS.supports("color", word)
    ) {
      return { color: word, body: m[2] };
    }
  }
  return { color: null, body: text };
}
