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

export type WaveUserData = {
  userId: string;
  waveType: number;
  period: number;
  color: string;
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

export type SessionState = {
  sessionName: string;
  comments: Comment[];
  bgColor: string;
  viewerCount: ViewerCount;
  notification: string | null;
  kickedUserIds: string[];
  waveEnabled: boolean;
  waveData: WaveInfo[];
  waveUsers: WaveUserData[];
  qrVisible: boolean;
  qrSvg: string | null;
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
  | { type: "wave:data"; waves: WaveInfo[]; users: WaveUserData[] }
  | { type: "qr-visible"; visible: boolean; qrSvg?: string }
  | { type: "error"; message: string };

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeClientMessage(data: string): ClientMessage | null {
  try {
    return JSON.parse(data) as ClientMessage;
  } catch {
    return null;
  }
}

export function decodeServerMessage(data: string): ServerMessage | null {
  try {
    return JSON.parse(data) as ServerMessage;
  } catch {
    return null;
  }
}
