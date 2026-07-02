import type * as Party from "partykit/server";
import type { Comment, WaveInfo } from "../app/lib/protocol";
import { encodeMessage, ENDING_GRACE_MS } from "../app/lib/protocol";

type ConnectionMeta = {
  role: "admin" | "viewer" | "screen";
  userId: string;
};

type WaveParticipant = {
  waveType: number;
  period: number;
  idle: boolean;
};

const MAX_COMMENTS = 500;
const RATE_LIMIT_MS = 500;
const MAX_COMMENT_LENGTH = 200;
const WAVE_BROADCAST_INTERVAL = 500;
const MAX_QR_SVG_LENGTH = 20_000;

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
  adminToken: string | null = null;
  ended = false;
  endingDeadline: number | null = null;
  endingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {}

  // ルームがハイバネーション/退避から復帰しても、認可・終了状態が巻き戻らないよう永続化する
  async onStart() {
    const [adminToken, ended, kickedUserIds, sessionName] = await Promise.all([
      this.room.storage.get<string>("adminToken"),
      this.room.storage.get<boolean>("ended"),
      this.room.storage.get<string[]>("kickedUserIds"),
      this.room.storage.get<string>("sessionName"),
    ]);
    if (adminToken) this.adminToken = adminToken;
    if (ended) this.ended = true;
    if (kickedUserIds) this.kickedUserIds = new Set(kickedUserIds);
    if (sessionName) this.sessionName = sessionName;
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const role = (url.searchParams.get("role") || "viewer") as ConnectionMeta["role"];
    const userId = url.searchParams.get("userId") || conn.id;

    if (this.ended) {
      conn.send(encodeMessage({ type: "session:ended" }));
      conn.close();
      return;
    }

    if (role === "admin") {
      const token = url.searchParams.get("adminToken");
      if (!token) {
        conn.send(encodeMessage({ type: "error", message: "管理者トークンが必要です", fatal: true }));
        conn.close();
        return;
      }
      if (this.adminToken === null) {
        this.adminToken = token;
        void this.room.storage.put("adminToken", token);
      } else if (this.adminToken !== token) {
        conn.send(encodeMessage({ type: "error", message: "管理者トークンが無効です", fatal: true }));
        conn.close();
        return;
      }
      this.adminConnections.add(conn.id);
      if (this.endingTimer) {
        clearTimeout(this.endingTimer);
        this.endingTimer = null;
        this.endingDeadline = null;
        this.broadcast(encodeMessage({ type: "session:ending-cancelled" }));
      }
      if (!this.sessionName) {
        const name = url.searchParams.get("sessionName");
        if (name) {
          this.sessionName = name;
          void this.room.storage.put("sessionName", name);
        }
      }
      this.broadcastAdminCount();
    } else if (this.kickedUserIds.has(userId)) {
      // 有効なトークンを持つ管理者はキック済みuserIdでも締め出さない
      conn.send(encodeMessage({ type: "user:kicked", userId }));
      conn.close();
      return;
    }

    this.connectionMeta.set(conn.id, { role, userId });

    if (role === "viewer") {
      this.totalViewers++;
      this.activeViewers++;
      this.broadcastViewerCount();
    }

    conn.send(
      encodeMessage({
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
          qrVisible: this.qrVisible,
          qrSvg: this.qrSvg,
          endingAt: this.endingDeadline,
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
      case "admin:end-session":
        if (this.isAdmin(sender)) this.endSession();
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
      if (!this.ended && this.adminConnections.size === 0) {
        this.startEndingCountdown();
      } else {
        this.broadcastAdminCount();
      }
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
      sender.send(encodeMessage({ type: "error", message: "コメントが長すぎます" }));
      return;
    }

    const now = Date.now();
    const lastTime = this.lastCommentTime.get(meta.userId);
    if (lastTime && now - lastTime < RATE_LIMIT_MS) {
      sender.send(encodeMessage({ type: "error", message: "送信が速すぎます" }));
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

    this.broadcast(encodeMessage({ type: "comment:new", comment }));
  }

  private handleDeleteComment(commentId: string) {
    this.comments = this.comments.filter((c) => c.id !== commentId);
    this.broadcast(encodeMessage({ type: "comment:deleted", commentId }));
  }

  private handleKick(userId: string) {
    this.kickedUserIds.add(userId);
    void this.room.storage.put("kickedUserIds", [...this.kickedUserIds]);
    this.waveParticipants.delete(userId);
    this.broadcast(encodeMessage({ type: "user:kicked", userId }));

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
    this.broadcast(encodeMessage({ type: "notify", text: this.notification }));
  }

  private handleClearNotify() {
    this.notification = null;
    this.broadcast(encodeMessage({ type: "notify:clear" }));
  }

  private handleBgColor(color: string) {
    if (!color || typeof color !== "string") return;
    if (!/^#[0-9a-fA-F]{3,8}$/.test(color) && !/^[a-zA-Z]+$/.test(color)) return;
    this.bgColor = color;
    this.broadcast(encodeMessage({ type: "bg-color", color }));
  }

  private handleQrToggle(visible: boolean, qrSvg?: string) {
    this.qrVisible = visible;
    this.qrSvg =
      visible &&
      typeof qrSvg === "string" &&
      qrSvg.length <= MAX_QR_SVG_LENGTH &&
      qrSvg.trimStart().startsWith("<svg")
        ? qrSvg
        : null;
    this.broadcast(encodeMessage({ type: "qr-visible", visible, qrSvg: this.qrSvg }));
  }

  private handleWaveToggle(enabled: boolean) {
    this.waveEnabled = enabled;
    if (!enabled) {
      this.waveParticipants.clear();
    }
    this.broadcast(encodeMessage({ type: "wave:status", enabled }));
    this.broadcastWaveData();
  }

  private handleWaveJoin(userId: string, waveType: number) {
    if (!this.waveEnabled) return;
    this.waveParticipants.set(userId, { waveType, period: 2, idle: false });
    this.scheduleWaveBroadcast();
  }

  private handleWaveLeave(userId: string) {
    this.waveParticipants.delete(userId);
    this.scheduleWaveBroadcast();
  }

  private handleWavePeriod(userId: string, seconds: number, waveType: number) {
    if (!this.waveEnabled) return;
    const clamped = Math.max(0.3, Math.min(5, seconds));
    this.waveParticipants.set(userId, { waveType, period: clamped, idle: false });
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

  private broadcastWaveData() {
    this.lastWaveBroadcast = Date.now();
    this.broadcast(encodeMessage({ type: "wave:data", waves: this.aggregateWaveData() }));
  }

  private broadcastViewerCount() {
    this.broadcast(
      encodeMessage({
        type: "viewer:count",
        count: { total: this.totalViewers, active: this.activeViewers },
      }),
    );
  }

  private startEndingCountdown() {
    if (this.endingTimer) return;
    this.endingDeadline = Date.now() + ENDING_GRACE_MS;
    this.broadcast(encodeMessage({ type: "session:ending", deadline: this.endingDeadline }));
    this.endingTimer = setTimeout(() => {
      this.endingTimer = null;
      this.endSession();
    }, ENDING_GRACE_MS);
  }

  private endSession() {
    if (this.endingTimer) {
      clearTimeout(this.endingTimer);
      this.endingTimer = null;
    }
    this.endingDeadline = null;
    this.ended = true;
    void this.room.storage.put("ended", true);
    const msg = encodeMessage({ type: "session:ended" });
    for (const conn of this.room.getConnections()) {
      conn.send(msg);
      conn.close();
    }
  }

  // admin:countは管理画面しか使わないため、全接続にばらまかない
  private broadcastAdminCount() {
    const msg = encodeMessage({ type: "admin:count", count: this.adminConnections.size });
    for (const id of this.adminConnections) {
      this.room.getConnection(id)?.send(msg);
    }
  }

  private broadcast(message: string) {
    for (const conn of this.room.getConnections()) {
      conn.send(message);
    }
  }
}

SessionServer satisfies Party.Worker;
