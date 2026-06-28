import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { getUserId, formatTime, isUrlLine } from "~/lib/utils";
import { MarqueeText } from "~/components/marquee-text";
import {
  Button,
  Dialog,
  TextArea,
  Flex,
  Box,
  Text,
  IconButton,
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
  // 最新20件のみ保持
  const trimmed = list.slice(-MAX_HISTORY);
  localStorage.setItem(
    `adhoc-nico-comments-${sessionId}`,
    JSON.stringify(trimmed),
  );
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isKicked = session.kickedUserIds.includes(userId);

  // ローカルコメント読み込み
  useEffect(() => {
    if (sessionId) setLocalComments(loadComments(sessionId));
  }, [sessionId]);

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

    // フォーカス維持
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [text, sending, isKicked, session, sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayedComments = expanded
    ? localComments.slice(-MAX_HISTORY)
    : localComments.slice(-COLLAPSED_COUNT);

  // 通知テキストを行ごとに分割して表示
  const renderNotification = (notifText: string) =>
    notifText.split("\n").map((line, i) =>
      isUrlLine(line) ? (
        <a
          key={i}
          href={line.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className={css({
            color: "#8b9cf7",
            textDecoration: "underline",
            wordBreak: "break-all",
            display: "block",
          })}
        >
          {line.trim()}
        </a>
      ) : (
        <span key={i} className={css({ display: "block" })}>
          {line}
        </span>
      ),
    );

  return (
    <Box
      className={css({
        backgroundColor: "#000",
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        overflow: "hidden",
      })}
    >
      {/* 通知エリア */}
      {session.notification && (
        <Box
          className={css({
            backgroundColor: "rgba(139,92,246,0.2)",
            borderBottom: "1px solid rgba(139,92,246,0.4)",
            padding: "10px 16px",
            animation: "slideDown 0.3s ease-out",
          })}
        >
          <Text size="2">{renderNotification(session.notification)}</Text>
        </Box>
      )}

      {/* エラー表示 */}
      {session.error && (
        <Box
          className={css({
            backgroundColor: "rgba(239,68,68,0.2)",
            borderBottom: "1px solid rgba(239,68,68,0.4)",
            padding: "8px 16px",
            animation: "slideDown 0.2s ease-out",
          })}
        >
          <Text size="2" color="red">
            {session.error}
          </Text>
        </Box>
      )}

      {/* メインエリア */}
      <Flex
        direction="column"
        className={css({ flex: 1, padding: "16px", gap: "12px", overflow: "auto" })}
      >
        {/* キック通知 */}
        {isKicked ? (
          <Box
            className={css({
              textAlign: "center",
              padding: "32px 16px",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text size="3" color="red">
              管理者によって退出されました
            </Text>
          </Box>
        ) : (
          <>
            {/* コメント入力 */}
            <Flex direction="column" gap="2">
              <TextArea
                ref={textareaRef}
                placeholder="コメントを入力..."
                value={text}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) setText(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                rows={2}
                className={css({
                  fontSize: "16px !important",
                  resize: "none",
                })}
              />
              <Flex justify="between" align="center">
                <Text size="1" color="gray">
                  {text.length}/{MAX_CHARS}
                </Text>
                <Button
                  size="2"
                  disabled={!text.trim() || sending}
                  onClick={handleSend}
                >
                  <PaperPlaneIcon />
                  送信
                </Button>
              </Flex>
            </Flex>

            {/* 送信済みコメント一覧 */}
            {localComments.length > 0 && (
              <Flex direction="column" gap="1">
                <Text size="1" color="gray" mb="1">
                  送信済み
                </Text>
                {displayedComments.map((c, i) => (
                  <Flex
                    key={`${c.timestamp}-${i}`}
                    gap="2"
                    align="start"
                    className={css({
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255,255,255,0.04)",
                    })}
                  >
                    <Text
                      size="1"
                      color="gray"
                      className={css({
                        flexShrink: 0,
                        fontFamily: "monospace",
                        lineHeight: "1.6",
                      })}
                    >
                      {formatTime(c.timestamp)}
                    </Text>
                    <Text
                      size="2"
                      className={css({ wordBreak: "break-all" })}
                    >
                      {c.text}
                    </Text>
                  </Flex>
                ))}
                {localComments.length > COLLAPSED_COUNT && (
                  <Button
                    variant="ghost"
                    size="1"
                    onClick={() => setExpanded((v) => !v)}
                    className={css({ alignSelf: "center" })}
                  >
                    {expanded ? "閉じる" : "もっと見る"}
                  </Button>
                )}
              </Flex>
            )}
          </>
        )}
      </Flex>

      {/* ボトムバー */}
      <Flex
        align="center"
        className={css({
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "8px 16px",
          gap: "8px",
          flexShrink: 0,
        })}
      >
        <MarqueeText
          text={session.sessionName || "---"}
          className={css({ flex: 1, fontSize: "13px", color: "rgba(255,255,255,0.6)" })}
        />
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
                <Text size="1" color="gray">
                  あなたのID
                </Text>
                <Text
                  size="2"
                  className={css({ fontFamily: "monospace", userSelect: "all" })}
                >
                  {userId}
                </Text>
              </Flex>
            </Flex>
            <Flex justify="end" mt="3">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  閉じる
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
}
