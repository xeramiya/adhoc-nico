export type Comment = {
  id: string;
  text: string;
  userId: string;
  timestamp: number;
};

export type ViewerCount = {
  total: number;
  active: number;
};

export type WaveInfo = {
  waveType: number;
  period: number;
  count: number;
  idle: boolean;
};

export const WAVE_PATTERNS = [
  "下广卞廿十亠卉与本二上旦上二本与卉亠十廿卞广",
  "▁▂▃▅▆▇▇▆▅▃▂▁",
  "➫➙➬➭➫➙➬➮➪",
  "↗⁀↘‿↗⁀↘‿",
];

export const NEON_COLORS = [
  "#FF00FF",
  "#00FFFF",
  "#39FF14",
  "#FF6600",
  "#FF0099",
  "#FFFF00",
  "#00FF99",
  "#FF3366",
  "#9933FF",
  "#00CCFF",
];

// 最後の管理者が切断してからセッションが自動終了するまでの猶予
export const ENDING_GRACE_MS = 60_000;

export type SessionState = {
  sessionName: string;
  comments: Comment[];
  bgColor: string;
  viewerCount: ViewerCount;
  notification: string | null;
  kickedUserIds: string[];
  waveEnabled: boolean;
  waveData: WaveInfo[];
  qrVisible: boolean;
  qrSvg: string | null;
  endingAt: number | null;
};

export type ClientMessage =
  | { type: "comment:send"; text: string }
  | { type: "admin:delete-comment"; commentId: string }
  | { type: "admin:kick"; userId: string }
  | { type: "admin:notify"; text: string }
  | { type: "admin:clear-notify" }
  | { type: "admin:bg-color"; color: string }
  | { type: "admin:wave-toggle"; enabled: boolean }
  | { type: "admin:qr-toggle"; visible: boolean; qrSvg?: string }
  | { type: "admin:end-session" }
  | { type: "wave:join"; waveType: number }
  | { type: "wave:leave" }
  | { type: "wave:period"; seconds: number; waveType: number }
  | { type: "wave:idle" };

export type ServerMessage =
  | { type: "sync"; state: SessionState }
  | { type: "comment:new"; comment: Comment }
  | { type: "comment:deleted"; commentId: string }
  | { type: "user:kicked"; userId: string }
  | { type: "viewer:count"; count: ViewerCount }
  | { type: "notify"; text: string }
  | { type: "notify:clear" }
  | { type: "bg-color"; color: string }
  | { type: "wave:status"; enabled: boolean }
  | { type: "wave:data"; waves: WaveInfo[] }
  | { type: "qr-visible"; visible: boolean; qrSvg: string | null }
  | { type: "session:ended" }
  | { type: "session:ending"; deadline: number }
  | { type: "session:ending-cancelled" }
  | { type: "admin:count"; count: number }
  // fatal: 再接続しても解消しないエラー（認証失敗など）。クライアントは再接続を止める
  | { type: "error"; message: string; fatal?: boolean };

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

