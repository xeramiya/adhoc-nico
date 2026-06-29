import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { useShake, requestMotionPermission, type MotionPermissionResult } from "~/lib/use-shake";
import { getUserId, formatTime, isUrlLine } from "~/lib/utils";
import { WAVE_PATTERNS } from "~/lib/protocol";
import { MarqueeText } from "~/components/marquee-text";
import {
  Button,
  Dialog,
  TextArea,
  Flex,
  Box,
  Text,
  IconButton,
  Select,
} from "@radix-ui/themes";
import { PaperPlaneIcon, DotsHorizontalIcon } from "@radix-ui/react-icons";

const MAX_CHARS = 200;
const COLLAPSED_COUNT = 3;
const MAX_HISTORY = 20;

type LocalComment = { text: string; timestamp: number };

function loadComments(sessionId: string): LocalComment[] {
  try {
    const raw = localStorage.getItem(`adhoc-nico-comments-${sessionId}`);
    return raw ? (JSON.parse(raw) as LocalComment[]) : [];
  } catch {
    return [];
  }
}

function saveComment(sessionId: string, comment: LocalComment) {
  const list = loadComments(sessionId);
  list.push(comment);
  const trimmed = list.slice(-MAX_HISTORY);
  localStorage.setItem(`adhoc-nico-comments-${sessionId}`, JSON.stringify(trimmed));
}

export default function Viewer() {
  const { sessionId } = useParams();
  const [userId] = useState(() => getUserId());
  const session = useSession(sessionId!, "viewer", userId);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [waveJoined, setWaveJoined] = useState(false);
  const [waveType, setWaveType] = useState(1);
  const [motionError, setMotionError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isKicked = session.kickedUserIds.includes(userId);
  const { period, sensorActive } = useShake(waveJoined);
  const { waveEnabled, joinWave, leaveWave, sendWavePeriod, sendWaveIdle } = session;
  const hadPeriodRef = useRef(false);

  useEffect(() => {
    if (sessionId) setLocalComments(loadComments(sessionId));
  }, [sessionId]);

  // ウェーブ参加時にiOSの「取り消す」ダイアログを抑制
  useEffect(() => {
    if (!waveJoined) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const preventUndo = (e: Event) => {
      const ie = e as InputEvent;
      if (ie.inputType === "historyUndo" || ie.inputType === "historyRedo") {
        ie.preventDefault();
      }
    };

    document.addEventListener("beforeinput", preventUndo, true);
    return () => {
      document.removeEventListener("beforeinput", preventUndo, true);
    };
  }, [waveJoined]);

  // ウェーブ無効時に自動離脱
  useEffect(() => {
    if (!waveEnabled && waveJoined) {
      setWaveJoined(false);
      leaveWave();
    }
  }, [waveEnabled, waveJoined, leaveWave]);

  // 周期変更をサーバーに送信 / 周期消失時にidle通知
  useEffect(() => {
    if (!waveJoined) {
      hadPeriodRef.current = false;
      return;
    }
    if (period != null) {
      hadPeriodRef.current = true;
      sendWavePeriod(period, waveType);
    } else if (hadPeriodRef.current) {
      sendWaveIdle();
    }
  }, [period, waveJoined, waveType, sendWavePeriod, sendWaveIdle]);

  const handleJoinWave = useCallback(async () => {
    setMotionError(null);
    const result = await requestMotionPermission();
    if (result === "unavailable") {
      setMotionError("このデバイスでは加速度センサーが使用できません。");
      return;
    }
    if (result === "denied") {
      setMotionError("加速度センサーの使用が許可されていません。iOSの場合: 設定→Safari→モーションと画面の向きのアクセスを有効にしてください。");
      return;
    }
    setWaveJoined(true);
    joinWave(waveType);
  }, [joinWave, waveType]);

  const handleLeaveWave = useCallback(() => {
    setWaveJoined(false);
    leaveWave();
  }, [leaveWave]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sending || isKicked) return;

    session.sendComment(trimmed);
    const comment: LocalComment = { text: trimmed, timestamp: Date.now() };
    saveComment(sessionId!, comment);
    setLocalComments((prev) => [...prev, comment].slice(-MAX_HISTORY));

    setText("");
    setSending(true);
    setTimeout(() => setSending(false), 500);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [text, sending, isKicked, session, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayedComments = expanded
    ? [...localComments.slice(-MAX_HISTORY)].reverse()
    : [...localComments.slice(-COLLAPSED_COUNT)].reverse();

  const renderNotification = (notifText: string) =>
    notifText.split("\n").map((line, i) =>
      isUrlLine(line) ? (
        <a
          key={i}
          href={line.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className={css({ color: "#8b9cf7", textDecoration: "underline", wordBreak: "break-all", display: "block" })}
        >
          {line.trim()}
        </a>
      ) : (
        <span key={i} className={css({ display: "block" })}>{line}</span>
      ),
    );

  return (
    <Box className={css({ backgroundColor: "#000", height: "100dvh", display: "flex", flexDirection: "column", color: "#fff", overflow: "hidden" })}>
      {/* 通知エリア */}
      {session.notification && (
        <Box className={css({ backgroundColor: "rgba(139,92,246,0.2)", borderBottom: "1px solid rgba(139,92,246,0.4)", padding: "10px 16px", animation: "slideDown 0.3s ease-out" })}>
          <Text size="3">{renderNotification(session.notification)}</Text>
        </Box>
      )}

      {/* ウェーブ参加エリア */}
      {session.waveEnabled && !isKicked && !waveJoined && (
        <Box className={css({ backgroundColor: "rgba(34,197,94,0.15)", borderBottom: "1px solid rgba(34,197,94,0.3)", padding: "10px 16px", animation: "slideDown 0.3s ease-out" })}>
          <Flex direction="column" gap="2">
            <Flex align="center" justify="between">
              <Text size="3">🌊 ウェーブが始まりました！</Text>
              <Button size="2" variant="solid" color="green" onClick={handleJoinWave}>
                参加する
              </Button>
            </Flex>
            {motionError && (
              <Text size="2" color="red">{motionError}</Text>
            )}
          </Flex>
        </Box>
      )}

      {/* ウェーブ参加中表示 */}
      {waveJoined && (
        <Box className={css({ backgroundColor: "rgba(34,197,94,0.25)", borderBottom: "1px solid rgba(34,197,94,0.4)", padding: "10px 16px" })}>
          <Flex align="center" justify="between">
            <Flex direction="column" gap="1">
              <Text size="3">🌊 ウェーブ参加中 — スマホを振ってください！</Text>
              {period != null ? (
                <Text size="2" color="gray">
                  周期検知中: {period.toFixed(2)}秒 ({(60 / period).toFixed(0)} BPM)
                </Text>
              ) : sensorActive ? (
                <Text size="2" color="gray">周期未検知 — 振り続けてください</Text>
              ) : (
                <Text size="2" className={css({ color: "#eab308" })}>
                  センサー待機中... 反応がない場合はHTTPS接続か確認してください
                </Text>
              )}
            </Flex>
            <Button size="2" variant="soft" color="red" onClick={handleLeaveWave}>
              一旦出る
            </Button>
          </Flex>
        </Box>
      )}

      {/* エラー表示 */}
      {session.error && (
        <Box className={css({ backgroundColor: "rgba(239,68,68,0.2)", borderBottom: "1px solid rgba(239,68,68,0.4)", padding: "8px 16px", animation: "slideDown 0.2s ease-out" })}>
          <Text size="3" color="red">{session.error}</Text>
        </Box>
      )}

      {/* メインエリア */}
      <Flex direction="column" className={css({ flex: 1, minHeight: 0, padding: "16px", gap: "12px", overflow: "auto" })}>
        {isKicked ? (
          <Box className={css({ textAlign: "center", padding: "32px 16px", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" })}>
            <Text size="3" color="red">管理者によって退出されました</Text>
          </Box>
        ) : (
          <>
            {/* コメント入力（ウェーブ参加中は非表示） */}
            {!waveJoined && (
              <Flex direction="column" gap="2">
                <TextArea
                  ref={textareaRef}
                  placeholder="コメントを入力..."
                  value={text}
                  onChange={(e) => { if (e.target.value.length <= MAX_CHARS) setText(e.target.value); }}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className={css({ fontSize: "18px !important", resize: "none" })}
                />
                <Flex justify="between" align="center">
                  <Text size="2" color="gray">{text.length}/{MAX_CHARS}</Text>
                  <Button size="3" disabled={!text.trim() || sending} onClick={handleSend}>
                    <PaperPlaneIcon />
                    送信
                  </Button>
                </Flex>
              </Flex>
            )}

            {/* 送信済みコメント一覧 */}
            {localComments.length > 0 && (
              <Flex direction="column" gap="1">
                <Text size="1" color="gray" mb="1">送信済み</Text>
                {displayedComments.map((c, i) => (
                  <Flex key={`${c.timestamp}-${i}`} gap="2" align="start" className={css({ padding: "4px 8px", borderRadius: "4px", backgroundColor: "rgba(255,255,255,0.04)" })}>
                    <Text size="1" color="gray" className={css({ flexShrink: 0, fontFamily: "monospace", lineHeight: "1.6" })}>
                      {formatTime(c.timestamp)}
                    </Text>
                    <Text size="2" className={css({ wordBreak: "break-all" })}>{c.text}</Text>
                  </Flex>
                ))}
                {localComments.length > COLLAPSED_COUNT && (
                  <Button variant="ghost" size="1" onClick={() => setExpanded((v) => !v)} className={css({ alignSelf: "center" })}>
                    {expanded ? "閉じる" : "もっと見る"}
                  </Button>
                )}
              </Flex>
            )}
          </>
        )}
      </Flex>

      {/* ボトムバー */}
      <Flex align="center" className={css({ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "8px 16px", gap: "8px", flexShrink: 0 })}>
        <MarqueeText text={session.sessionName || "---"} className={css({ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.6)" })} />
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger>
            <IconButton variant="ghost" size="1" color="gray">
              <DotsHorizontalIcon />
            </IconButton>
          </Dialog.Trigger>
          <Dialog.Content maxWidth="320px">
            <Dialog.Title>メニュー</Dialog.Title>
            <Flex direction="column" gap="3" py="2">
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">あなたのID</Text>
                <Text size="2" className={css({ fontFamily: "monospace", userSelect: "all" })}>{userId}</Text>
              </Flex>
              {/* ウェーブ種類選択 */}
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">ウェーブの種類</Text>
                <Select.Root
                  value={String(waveType)}
                  onValueChange={(v) => {
                    const newType = Number(v);
                    setWaveType(newType);
                    if (waveJoined) joinWave(newType);
                  }}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {WAVE_PATTERNS.map((p, i) => (
                      <Select.Item key={i} value={String(i)}>
                        タイプ{i + 1}: {p.slice(0, 6)}...
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Flex>
            </Flex>
            <Flex justify="end" mt="3">
              <Dialog.Close>
                <Button variant="soft" color="gray">閉じる</Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
}
