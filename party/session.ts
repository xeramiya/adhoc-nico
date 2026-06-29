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

type WaveParticipant = {
  waveType: number;
  period: number;
  color: string;
  idle: boolean;
};

type WaveInfo = {
  waveType: number;
  period: number;
  count: number;
  idle: boolean;
};

const NEON_COLORS = [
  "#FF00FF", "#00FFFF", "#39FF14", "#FF6600", "#FF0099",
  "#FFFF00", "#00FF99", "#FF3366", "#9933FF", "#00CCFF",
];

const MAX_COMMENTS = 500;
const RATE_LIMIT_MS = 500;
const MAX_COMMENT_LENGTH = 200;
const WAVE_BROADCAST_INTERVAL = 500;

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

  waveEnabled = false;
  waveParticipants = new Map<string, WaveParticipant>();
  lastWaveBroadcast = 0;
  waveBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

  qrVisible = false;
  qrSvg: string | null = null;

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
          waveEnabled: this.waveEnabled,
          waveData: this.aggregateWaveData(),
          waveUsers: this.getWaveUsers(),
          qrVisible: this.qrVisible,
          qrSvg: this.qrSvg,
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
      case "admin:wave-toggle":
        if (this.isAdmin(sender)) this.handleWaveToggle(msg.enabled as boolean);
        break;
      case "admin:qr-toggle":
        if (this.isAdmin(sender)) this.handleQrToggle(msg.visible as boolean, msg.qrSvg as string | undefined);
        break;
      case "wave:join":
        this.handleWaveJoin(meta.userId, msg.waveType as number);
        break;
      case "wave:leave":
        this.handleWaveLeave(meta.userId);
        break;
      case "wave:period":
        this.handleWavePeriod(meta.userId, msg.seconds as number, msg.waveType as number);
        break;
      case "wave:idle":
        this.handleWaveIdle(meta.userId);
        break;
    }
  }

  onClose(conn: Party.Connection) {
    const meta = this.connectionMeta.get(conn.id);
    if (!meta) return;

    if (meta.role === "viewer") {
      this.activeViewers = Math.max(0, this.activeViewers - 1);
      this.broadcastViewerCount();
      this.waveParticipants.delete(meta.userId);
      this.scheduleWaveBroadcast();
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
    this.waveParticipants.delete(userId);
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

  private handleQrToggle(visible: boolean, qrSvg?: string) {
    this.qrVisible = visible;
    this.qrSvg = visible && qrSvg ? qrSvg : null;
    this.broadcast(JSON.stringify({ type: "qr-visible", visible, qrSvg: this.qrSvg }));
  }

  private handleWaveToggle(enabled: boolean) {
    this.waveEnabled = enabled;
    if (!enabled) {
      this.waveParticipants.clear();
    }
    this.broadcast(JSON.stringify({ type: "wave:status", enabled }));
    this.broadcastWaveData();
  }

  private handleWaveJoin(userId: string, waveType: number) {
    if (!this.waveEnabled) return;
    const existing = this.waveParticipants.get(userId);
    const color = existing?.color || NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    this.waveParticipants.set(userId, { waveType, period: 2, color, idle: false });
    this.scheduleWaveBroadcast();
  }

  private handleWaveLeave(userId: string) {
    this.waveParticipants.delete(userId);
    this.scheduleWaveBroadcast();
  }

  private handleWavePeriod(userId: string, seconds: number, waveType: number) {
    if (!this.waveEnabled) return;
    const clamped = Math.max(0.3, Math.min(5, seconds));
    const existing = this.waveParticipants.get(userId);
    const color = existing?.color || NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    this.waveParticipants.set(userId, { waveType, period: clamped, color, idle: false });
    this.scheduleWaveBroadcast();
  }

  private handleWaveIdle(userId: string) {
    const p = this.waveParticipants.get(userId);
    if (p && !p.idle) {
      p.idle = true;
      this.scheduleWaveBroadcast();
    }
  }

  private aggregateWaveData(): WaveInfo[] {
    const groups = new Map<number, { periods: number[]; idleCount: number }>();
    for (const p of this.waveParticipants.values()) {
      let g = groups.get(p.waveType);
      if (!g) { g = { periods: [], idleCount: 0 }; groups.set(p.waveType, g); }
      g.periods.push(p.period);
      if (p.idle) g.idleCount++;
    }

    const result: WaveInfo[] = [];
    for (const [waveType, g] of groups) {
      g.periods.sort((a, b) => a - b);
      const median = g.periods[Math.floor(g.periods.length / 2)];
      result.push({ waveType, period: median, count: g.periods.length, idle: g.idleCount === g.periods.length });
    }
    return result;
  }

  // スロットリング: 最大2回/秒
  private scheduleWaveBroadcast() {
    if (this.waveBroadcastTimer) return;
    const now = Date.now();
    const elapsed = now - this.lastWaveBroadcast;
    const delay = Math.max(0, WAVE_BROADCAST_INTERVAL - elapsed);
    this.waveBroadcastTimer = setTimeout(() => {
      this.waveBroadcastTimer = null;
      this.broadcastWaveData();
    }, delay);
  }

  private getWaveUsers() {
    const result: { userId: string; waveType: number; period: number; color: string }[] = [];
    for (const [userId, p] of this.waveParticipants) {
      result.push({ userId, waveType: p.waveType, period: p.period, color: p.color });
    }
    return result;
  }

  private broadcastWaveData() {
    this.lastWaveBroadcast = Date.now();
    const waves = this.aggregateWaveData();
    const users = this.getWaveUsers();
    this.broadcast(JSON.stringify({ type: "wave:data", waves, users }));
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
