import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import usePartySocket from "partysocket/react";
import type { Comment, ServerMessage, SessionState, ViewerCount } from "./protocol";
import { encodeMessage } from "./protocol";

const PARTY_HOST = typeof window !== "undefined" && window.location.hostname === "localhost" ? "localhost:1999" : "";

type SessionClientState = {
  comments: Comment[];
  bgColor: string;
  viewerCount: ViewerCount;
  notification: string | null;
  kickedUserIds: string[];
  sessionName: string;
  synced: boolean;
};

const initialState: SessionClientState = {
  comments: [],
  bgColor: "#252525",
  viewerCount: { total: 0, active: 0 },
  notification: null,
  kickedUserIds: [],
  sessionName: "",
  synced: false,
};

function sessionReducer(state: SessionClientState, msg: ServerMessage): SessionClientState {
  switch (msg.type) {
    case "sync":
      return { ...msg.state, synced: true };
    case "comment:new":
      return { ...state, comments: [...state.comments, msg.comment] };
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
    case "error":
      return state;
    default:
      return state;
  }
}

type Role = "admin" | "viewer" | "screen";

export function useSession(sessionId: string, role: Role, userId: string, sessionName?: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const [error, setError] = useState<string | null>(null);

  const query = useRef({
    role,
    userId,
    ...(sessionName ? { sessionName } : {}),
  });

  const socket = usePartySocket({
    host: PARTY_HOST,
    room: sessionId,
    party: "session",
    query: query.current,
    onMessage(event) {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === "error") {
          setError(msg.message);
          setTimeout(() => setError(null), 3000);
        } else {
          dispatch(msg);
        }
      } catch {
        // ignore
      }
    },
  });

  const sendComment = useCallback(
    (text: string) => {
      socket.send(encodeMessage({ type: "comment:send", text }));
    },
    [socket],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      socket.send(encodeMessage({ type: "admin:delete-comment", commentId }));
    },
    [socket],
  );

  const kickUser = useCallback(
    (userId: string) => {
      socket.send(encodeMessage({ type: "admin:kick", userId }));
    },
    [socket],
  );

  const sendNotify = useCallback(
    (text: string) => {
      socket.send(encodeMessage({ type: "admin:notify", text }));
    },
    [socket],
  );

  const clearNotify = useCallback(() => {
    socket.send(encodeMessage({ type: "admin:clear-notify" }));
  }, [socket]);

  const setBgColor = useCallback(
    (color: string) => {
      socket.send(encodeMessage({ type: "admin:bg-color", color }));
    },
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
    connectionStatus: socket.readyState,
  };
}

export function useNewComments(comments: Comment[]) {
  const prevLength = useRef(0);
  const [newComment, setNewComment] = useState<Comment | null>(null);

  useEffect(() => {
    if (comments.length > prevLength.current) {
      setNewComment(comments[comments.length - 1]);
    }
    prevLength.current = comments.length;
  }, [comments]);

  return newComment;
}
