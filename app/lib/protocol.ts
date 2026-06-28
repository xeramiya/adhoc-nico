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

export type SessionState = {
  sessionName: string;
  comments: Comment[];
  bgColor: string;
  viewerCount: ViewerCount;
  notification: string | null;
  kickedUserIds: string[];
};

export type ClientMessage =
  | { type: "comment:send"; text: string }
  | { type: "admin:delete-comment"; commentId: string }
  | { type: "admin:kick"; userId: string }
  | { type: "admin:notify"; text: string }
  | { type: "admin:clear-notify" }
  | { type: "admin:bg-color"; color: string };

export type ServerMessage =
  | { type: "sync"; state: SessionState }
  | { type: "comment:new"; comment: Comment }
  | { type: "comment:deleted"; commentId: string }
  | { type: "user:kicked"; userId: string }
  | { type: "viewer:count"; count: ViewerCount }
  | { type: "notify"; text: string }
  | { type: "notify:clear" }
  | { type: "bg-color"; color: string }
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
