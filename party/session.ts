import type * as Party from "partykit/server";

type Comment = {
  id: string;
  text: string;
  userId: string;
  timestamp: number;
};

type ConnectionMeta = {
  role: "admin" | "viewer" | "screen";
  userId: string;
};

const MAX_COMMENTS = 500;
const RATE_LIMIT_MS = 500;
const MAX_COMMENT_LENGTH = 200;

export default class SessionServer implements Party.Server {
  sessionName = "";
  comments: Comment[] = [];
  bgColor = "#252525";
  notification: string | null = null;
  kickedUserIds = new Set<string>();
  totalViewers = 0;
  activeViewers = 0;
  connectionMeta = new Map<string, ConnectionMeta>();
  adminConnections = new Set<string>();
  lastCommentTime = new Map<string, number>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const role = (url.searchParams.get("role") || "viewer") as ConnectionMeta["role"];
    const userId = url.searchParams.get("userId") || conn.id;

    if (this.kickedUserIds.has(userId)) {
      conn.send(JSON.stringify({ type: "user:kicked", userId }));
      conn.close();
      return;
    }

    this.connectionMeta.set(conn.id, { role, userId });

    if (role === "admin") {
      this.adminConnections.add(conn.id);
      if (!this.sessionName) {
        const name = url.searchParams.get("sessionName");
        if (name) this.sessionName = name;
      }
    }

    if (role === "viewer") {
      this.totalViewers++;
      this.activeViewers++;
      this.broadcastViewerCount();
    }

    conn.send(
      JSON.stringify({
        type: "sync",
        state: {
          sessionName: this.sessionName,
          comments: this.comments,
          bgColor: this.bgColor,
          viewerCount: { total: this.totalViewers, active: this.activeViewers },
          notification: this.notification,
          kickedUserIds: [...this.kickedUserIds],
        },
      }),
    );
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(message as string);
    } catch {
      return;
    }

    const meta = this.connectionMeta.get(sender.id);
    if (!meta) return;

    switch (msg.type) {
      case "comment:send":
        this.handleCommentSend(msg.text as string, meta, sender);
        break;
      case "admin:delete-comment":
        if (this.isAdmin(sender)) this.handleDeleteComment(msg.commentId as string);
        break;
      case "admin:kick":
        if (this.isAdmin(sender)) this.handleKick(msg.userId as string);
        break;
      case "admin:notify":
        if (this.isAdmin(sender)) this.handleNotify(msg.text as string);
        break;
      case "admin:clear-notify":
        if (this.isAdmin(sender)) this.handleClearNotify();
        break;
      case "admin:bg-color":
        if (this.isAdmin(sender)) this.handleBgColor(msg.color as string);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const meta = this.connectionMeta.get(conn.id);
    if (!meta) return;

    if (meta.role === "viewer") {
      this.activeViewers = Math.max(0, this.activeViewers - 1);
      this.broadcastViewerCount();
    }

    if (meta.role === "admin") {
      this.adminConnections.delete(conn.id);
    }

    this.connectionMeta.delete(conn.id);
  }

  private isAdmin(conn: Party.Connection): boolean {
    return this.adminConnections.has(conn.id);
  }

  private handleCommentSend(text: string, meta: ConnectionMeta, sender: Party.Connection) {
    if (!text || typeof text !== "string") return;

    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_COMMENT_LENGTH) {
      sender.send(JSON.stringify({ type: "error", message: "コメントが長すぎます" }));
      return;
    }

    const now = Date.now();
    const lastTime = this.lastCommentTime.get(meta.userId);
    if (lastTime && now - lastTime < RATE_LIMIT_MS) {
      sender.send(JSON.stringify({ type: "error", message: "送信が速すぎます" }));
      return;
    }
    this.lastCommentTime.set(meta.userId, now);

    const comment: Comment = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      text: trimmed,
      userId: meta.userId,
      timestamp: now,
    };

    this.comments.push(comment);
    if (this.comments.length > MAX_COMMENTS) {
      this.comments = this.comments.slice(-MAX_COMMENTS);
    }

    this.broadcast(JSON.stringify({ type: "comment:new", comment }));
  }

  private handleDeleteComment(commentId: string) {
    this.comments = this.comments.filter((c) => c.id !== commentId);
    this.broadcast(JSON.stringify({ type: "comment:deleted", commentId }));
  }

  private handleKick(userId: string) {
    this.kickedUserIds.add(userId);
    this.broadcast(JSON.stringify({ type: "user:kicked", userId }));

    for (const conn of this.room.getConnections()) {
      const meta = this.connectionMeta.get(conn.id);
      if (meta && meta.userId === userId && meta.role === "viewer") {
        conn.close();
      }
    }
  }

  private handleNotify(text: string) {
    if (!text || typeof text !== "string") return;
    this.notification = text.trim();
    this.broadcast(JSON.stringify({ type: "notify", text: this.notification }));
  }

  private handleClearNotify() {
    this.notification = null;
    this.broadcast(JSON.stringify({ type: "notify:clear" }));
  }

  private handleBgColor(color: string) {
    if (!color || typeof color !== "string") return;
    this.bgColor = color;
    this.broadcast(JSON.stringify({ type: "bg-color", color }));
  }

  private broadcastViewerCount() {
    this.broadcast(
      JSON.stringify({
        type: "viewer:count",
        count: { total: this.totalViewers, active: this.activeViewers },
      }),
    );
  }

  private broadcast(message: string) {
    for (const conn of this.room.getConnections()) {
      conn.send(message);
    }
  }
}

SessionServer satisfies Party.Worker;
