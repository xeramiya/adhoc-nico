import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { useShake, requestMotionPermission, type MotionPermissionResult } from "~/lib/use-shake";
import { getUserId, formatTime, isUrlLine, parseColorCommand } from "~/lib/utils";
import { WAVE_PATTERNS } from "~/lib/protocol";
import { MarqueeText } from "~/components/marquee-text";
import {
  Badge,
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
import { AnimatePresence, motion } from "motion/react";

const MAX_CHARS = 200;
const MAX_DISPLAY_COMMENTS = 100;

export default function Viewer() {
  const { sessionId } = useParams();
  const [userId] = useState(() => getUserId());
  const session = useSession(sessionId!, "viewer", userId);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [endedDialogOpen, setEndedDialogOpen] = useState(false);
  const [endingRemaining, setEndingRemaining] = useState<number | null>(null);
  const [waveJoined, setWaveJoined] = useState(false);
  const [waveType, setWaveType] = useState(1);
  const [motionError, setMotionError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // テキスト量に応じてtextareaの高さを自動拡張
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, waveJoined]);

  const isKicked = session.kickedUserIds.includes(userId);
  // 毎秒のカウントダウン再レンダーでも全件コピーしないよう、表示分だけ切り出してメモ化する
  const displayComments = useMemo(
    () => session.comments.slice(-MAX_DISPLAY_COMMENTS).reverse(),
    [session.comments],
  );
  const { period, sensorActive } = useShake(waveJoined);
  const { waveEnabled, joinWave, leaveWave, sendWavePeriod, sendWaveIdle } = session;
  const hadPeriodRef = useRef(false);

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

  useEffect(() => {
    if (session.ended) setEndedDialogOpen(true);
  }, [session.ended]);

  useEffect(() => {
    if (!session.endingAt) { setEndingRemaining(null); return; }
    const update = () => {
      const left = Math.max(0, Math.ceil((session.endingAt! - Date.now()) / 1000));
      setEndingRemaining(left);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [session.endingAt]);

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
    setText("");
    setSending(true);
    setTimeout(() => setSending(false), 500);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [text, sending, isKicked, session]);

  // 改行を除去しつつ入力を反映
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.replace(/\n/g, "");
    if (value.length <= MAX_CHARS) setText(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      // Cmd/Ctrl+Enterで送信、単体Enterは改行させない
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) handleSend();
    }
  };

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
      {/* セッション終了カウントダウン */}
      <AnimatePresence>
        {endingRemaining != null && !session.ended && (
          <motion.div
            key="ending"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{ overflow: "hidden", flexShrink: 0 }}
          >
            <Box className={css({ backgroundColor: "rgba(239,68,68,0.2)", borderBottom: "1px solid rgba(239,68,68,0.4)", padding: "10px 16px" })}>
              <Text size="3">管理者が退出しました。{endingRemaining}秒以内に再接続がなければセッションは終了します。</Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 通知エリア */}
      <AnimatePresence>
        {session.notification && (
          <motion.div
            key="notification"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{ overflow: "hidden", flexShrink: 0 }}
          >
            <Box className={css({ backgroundColor: "rgba(139,92,246,0.2)", borderBottom: "1px solid rgba(139,92,246,0.4)", padding: "10px 16px" })}>
              <Text size="3">{renderNotification(session.notification)}</Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

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
            {/* コメント入力（ウェーブ参加中・終了済みは非表示） */}
            {!waveJoined && !session.ended && (
              <Flex direction="column" gap="2">
                <TextArea
                  ref={textareaRef}
                  placeholder="コメントを入力..."
                  value={text}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  className={css({ fontSize: "18px !important", resize: "none", overflow: "hidden" })}
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

            {/* コメント一覧 */}
            {displayComments.length > 0 && (
              <Flex direction="column" gap="1" className={css({ flex: 1, minHeight: 0, overflow: "auto" })}>
                <Text size="1" color="gray" mb="1">コメント</Text>
                {displayComments.map((c) => (
                  <Flex
                    key={c.id}
                    gap="2"
                    align="start"
                    className={css({
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255,255,255,0.04)",
                      opacity: c.userId === userId ? 1 : 0.4,
                    })}
                  >
                    <Text size="1" color="gray" className={css({ flexShrink: 0, fontFamily: "monospace", lineHeight: "1.6" })}>
                      {formatTime(c.timestamp)}
                    </Text>
                    <Text size="2" className={css({ wordBreak: "break-all" })}>{parseColorCommand(c.text).body}</Text>
                  </Flex>
                ))}
              </Flex>
            )}
          </>
        )}
      </Flex>

      {/* セッション終了ダイアログ */}
      <Dialog.Root open={endedDialogOpen} onOpenChange={setEndedDialogOpen}>
        <Dialog.Content maxWidth="320px">
          <Dialog.Title>セッションが終了しました</Dialog.Title>
          <Dialog.Description size="2">
            ご参加ありがとうございました
          </Dialog.Description>
          <Flex justify="end" mt="4">
            <Dialog.Close>
              <Button variant="soft">閉じる</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* ボトムバー */}
      <Flex align="center" className={css({ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "8px 16px", gap: "8px", flexShrink: 0 })}>
        {session.ended && <Badge color="red" variant="solid" size="1">終了済み</Badge>}
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
