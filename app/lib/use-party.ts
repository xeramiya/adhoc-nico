import { useReducer, useCallback, useRef, useState } from "react";
import usePartySocket from "partysocket/react";
import type { Comment, ServerMessage, ViewerCount, WaveInfo } from "./protocol";
import { encodeMessage } from "./protocol";
import { isLocalHostname } from "./utils";

const isDev = typeof window !== "undefined" && isLocalHostname(window.location.hostname);

const PARTY_HOST = isDev
  ? window.location.host
  : (import.meta.env.VITE_PARTY_HOST || (typeof window !== "undefined" ? window.location.host : ""));
const PARTY_PROTOCOL = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : undefined;

// サーバー側のMAX_COMMENTSと同じ上限。ライブ中の無制限な成長を防ぐ
const MAX_CLIENT_COMMENTS = 500;

type SessionClientState = {
  comments: Comment[];
  bgColor: string;
  viewerCount: ViewerCount;
  notification: string | null;
  kickedUserIds: string[];
  sessionName: string;
  synced: boolean;
  waveEnabled: boolean;
  waveData: WaveInfo[];
  qrVisible: boolean;
  qrSvg: string | null;
  endingAt: number | null;
  ended: boolean;
  adminCount: number;
};

const initialState: SessionClientState = {
  comments: [],
  bgColor: "#252525",
  viewerCount: { total: 0, active: 0 },
  notification: null,
  kickedUserIds: [],
  sessionName: "",
  synced: false,
  waveEnabled: false,
  waveData: [],
  qrVisible: false,
  qrSvg: null,
  endingAt: null,
  ended: false,
  adminCount: 0,
};

function sessionReducer(state: SessionClientState, msg: ServerMessage): SessionClientState {
  switch (msg.type) {
    case "sync":
      return { ...state, ...msg.state, synced: true };
    case "comment:new":
      return { ...state, comments: [...state.comments, msg.comment].slice(-MAX_CLIENT_COMMENTS) };
    case "comment:deleted":
      return { ...state, comments: state.comments.filter((c) => c.id !== msg.commentId) };
    case "viewer:count":
      return { ...state, viewerCount: msg.count };
    case "notify":
      return { ...state, notification: msg.text };
    case "notify:clear":
      return { ...state, notification: null };
    case "bg-color":
      return { ...state, bgColor: msg.color };
    case "user:kicked":
      return { ...state, kickedUserIds: [...state.kickedUserIds, msg.userId] };
    case "wave:status":
      return { ...state, waveEnabled: msg.enabled, waveData: msg.enabled ? state.waveData : [] };
    case "wave:data":
      return { ...state, waveData: msg.waves };
    case "qr-visible":
      return { ...state, qrVisible: msg.visible, qrSvg: msg.qrSvg };
    case "session:ended":
      return { ...state, ended: true, endingAt: null };
    case "session:ending":
      return { ...state, endingAt: msg.deadline };
    case "session:ending-cancelled":
      return { ...state, endingAt: null };
    case "admin:count":
      return { ...state, adminCount: msg.count };
    case "error":
      return state;
    default:
      return state;
  }
}

type Role = "admin" | "viewer" | "screen";

export function useSession(sessionId: string, role: Role, userId: string, sessionName?: string, adminToken?: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const [error, setError] = useState<string | null>(null);

  const query = useRef({
    role,
    userId,
    ...(sessionName ? { sessionName } : {}),
    ...(adminToken ? { adminToken } : {}),
  });

  const socket = usePartySocket({
    host: PARTY_HOST,
    protocol: PARTY_PROTOCOL,
    room: sessionId,
    party: "session",
    query: query.current,
    onMessage(event) {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "error") {
          setError(msg.message);
          if (msg.fatal) {
            socket.close();
          } else {
            setTimeout(() => setError(null), 3000);
          }
        } else {
          dispatch(msg);
          // サーバーはこの後closeする。放置するとpartysocketが無限再接続するため明示的に止める
          if (msg.type === "session:ended" || (msg.type === "user:kicked" && role === "viewer" && msg.userId === userId)) {
            socket.close();
          }
        }
      } catch {
        // ignore
      }
    },
  });

  const sendComment = useCallback(
    (text: string) => socket.send(encodeMessage({ type: "comment:send", text })),
    [socket],
  );

  const deleteComment = useCallback(
    (commentId: string) => socket.send(encodeMessage({ type: "admin:delete-comment", commentId })),
    [socket],
  );

  const kickUser = useCallback(
    (targetId: string) => socket.send(encodeMessage({ type: "admin:kick", userId: targetId })),
    [socket],
  );

  const sendNotify = useCallback(
    (text: string) => socket.send(encodeMessage({ type: "admin:notify", text })),
    [socket],
  );

  const clearNotify = useCallback(
    () => socket.send(encodeMessage({ type: "admin:clear-notify" })),
    [socket],
  );

  const setBgColor = useCallback(
    (color: string) => socket.send(encodeMessage({ type: "admin:bg-color", color })),
    [socket],
  );

  const toggleWave = useCallback(
    (enabled: boolean) => socket.send(encodeMessage({ type: "admin:wave-toggle", enabled })),
    [socket],
  );

  const toggleQr = useCallback(
    (visible: boolean, qrSvg?: string) => socket.send(encodeMessage({ type: "admin:qr-toggle", visible, qrSvg })),
    [socket],
  );

  const endSession = useCallback(
    () => socket.send(encodeMessage({ type: "admin:end-session" })),
    [socket],
  );

  const joinWave = useCallback(
    (waveType: number) => socket.send(encodeMessage({ type: "wave:join", waveType })),
    [socket],
  );

  const leaveWave = useCallback(
    () => socket.send(encodeMessage({ type: "wave:leave" })),
    [socket],
  );

  const sendWavePeriod = useCallback(
    (seconds: number, waveType: number) => socket.send(encodeMessage({ type: "wave:period", seconds, waveType })),
    [socket],
  );

  const sendWaveIdle = useCallback(
    () => socket.send(encodeMessage({ type: "wave:idle" })),
    [socket],
  );

  return {
    ...state,
    error,
    sendComment,
    deleteComment,
    kickUser,
    sendNotify,
    clearNotify,
    setBgColor,
    toggleWave,
    toggleQr,
    endSession,
    joinWave,
    leaveWave,
    sendWavePeriod,
    sendWaveIdle,
    connectionStatus: socket.readyState,
  };
}

