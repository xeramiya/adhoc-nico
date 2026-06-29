import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { formatTime } from "~/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import {
  Button,
  Dialog,
  TextArea,
  ScrollArea,
  Badge,
  IconButton,
  Flex,
  Box,
  Text,
  Card,
  Separator,
} from "@radix-ui/themes";
import {
  TrashIcon,
  CrossCircledIcon,
  Share1Icon,
  DesktopIcon,
  BellIcon,
  ActivityLogIcon,
  CopyIcon,
  CheckIcon,
} from "@radix-ui/react-icons";

const PRESET_COLORS = ["#000000", "#252525", "#1a1a3e", "#1a3e1a"];
const MAX_DISPLAY_COMMENTS = 200;

function generateQrSvg(url: string): string {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => {
    root.render(
      <QRCodeSVG value={url} size={120} bgColor="transparent" fgColor="#ffffff" level="M" />,
    );
  });
  const svg = container.innerHTML;
  root.unmount();
  return svg;
}

export default function Admin() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionName = searchParams.get("name") || "";
  const session = useSession(sessionId!, "admin", "admin", sessionName);

  const [notifyText, setNotifyText] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);

  const isConnected = session.connectionStatus === WebSocket.OPEN;
  const isLocal = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || /^(192|10|172)\.\d/.test(window.location.hostname));
  const audienceUrl =
    typeof window !== "undefined"
      ? isLocal
        ? `${window.location.protocol}//${__DEV_LAN_IP__}:${window.location.port}/${sessionId}`
        : `${window.location.origin}/${sessionId}`
      : "";

  const reversedComments = [...session.comments].reverse().slice(0, MAX_DISPLAY_COMMENTS);

  return (
    <Box className={css({ height: "100vh", overflow: "hidden", backgroundColor: "#1e1e2e" })}>
    <Box p="4" className={css({ maxWidth: "1200px", margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" })}>
      {/* トップバー */}
      <Card mb="3">
        <Flex align="center" justify="between" wrap="wrap" gap="3">
          <Flex align="center" gap="3">
            <Box
              className={css({
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: isConnected ? "#22c55e" : "#ef4444",
                flexShrink: 0,
              })}
            />
            <Text size="4" weight="bold">
              {session.sessionName || sessionId}
            </Text>
          </Flex>
          <Flex gap="2" wrap="wrap">
            <Button
              variant="soft"
              onClick={() => window.open(`/${sessionId}/screen`, "_blank")}
            >
              <DesktopIcon />
              コメント画面を開く
            </Button>
            <Button variant="soft" onClick={() => setQrOpen(true)}>
              <Share1Icon />
              QRコードを表示
            </Button>
            <Button
              variant={session.qrVisible ? "solid" : "soft"}
              color={session.qrVisible ? "green" : undefined}
              onClick={() => {
                if (session.qrVisible) {
                  session.toggleQr(false);
                } else {
                  const svg = generateQrSvg(audienceUrl);
                  session.toggleQr(true, svg);
                }
              }}
            >
              画面にQR{session.qrVisible ? "ON" : "OFF"}
            </Button>
          </Flex>
        </Flex>
      </Card>

      {/* エラー表示 */}
      {session.error && (
        <Card mb="3" className={css({ backgroundColor: "rgba(239,68,68,0.15)" })}>
          <Text color="red" size="2">{session.error}</Text>
        </Card>
      )}

      {/* 閲覧者数 */}
      <Flex gap="3" mb="3" align="center">
        <Badge size="2" variant="surface">
          アクティブ: {session.viewerCount.active} / のべ: {session.viewerCount.total}
        </Badge>
      </Flex>

      <Flex gap="3" className={css({ flex: 1, minHeight: 0, flexDirection: { base: "column", lg: "row" } })}>
        {/* コメント一覧 */}
        <Box className={css({ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" })}>
          <Text size="2" weight="bold" mb="2">
            コメント ({session.comments.length})
          </Text>
          <Card className={css({ flex: 1, minHeight: 0 })}>
            <ScrollArea className={css({ height: "100%" })}>
              {reversedComments.length === 0 ? (
                <Text size="2" color="gray" className={css({ padding: "16px", textAlign: "center" })}>
                  コメントはまだありません
                </Text>
              ) : (
                <Flex direction="column" gap="1">
                  {reversedComments.map((c) => (
                    <Flex
                      key={c.id}
                      align="center"
                      gap="2"
                      py="1"
                      px="2"
                      className={css({
                        borderRadius: "4px",
                        "&:hover": { backgroundColor: "rgba(255,255,255,0.04)" },
                      })}
                    >
                      <Text size="1" color="gray" className={css({ flexShrink: 0, fontFamily: "monospace" })}>
                        {formatTime(c.timestamp)}
                      </Text>
                      <Badge size="1" variant="outline" className={css({ flexShrink: 0 })}>
                        {c.userId.slice(0, 6)}
                      </Badge>
                      <Text size="2" className={css({ flex: 1, wordBreak: "break-all" })}>
                        {c.text}
                      </Text>
                      <Flex gap="1" className={css({ flexShrink: 0 })}>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={() => session.deleteComment(c.id)}
                          title="削除"
                        >
                          <TrashIcon />
                        </IconButton>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="orange"
                          onClick={() => setKickTarget(c.userId)}
                          title="キック"
                        >
                          <CrossCircledIcon />
                        </IconButton>
                      </Flex>
                    </Flex>
                  ))}
                </Flex>
              )}
            </ScrollArea>
          </Card>
        </Box>

        {/* サイドパネル */}
        <Box className={css({ width: { base: "100%", lg: "320px" }, flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px", overflow: "auto" })}>
          {/* 通知パネル */}
          <Card>
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <BellIcon />
                <Text size="2" weight="bold">通知</Text>
              </Flex>
              {session.notification && (
                <Card variant="surface">
                  <Text size="2">配信中: {session.notification}</Text>
                </Card>
              )}
              <TextArea
                placeholder="通知テキストを入力..."
                value={notifyText}
                onChange={(e) => setNotifyText(e.target.value)}
                rows={2}
              />
              <Flex gap="2">
                <Button
                  size="2"
                  onClick={() => {
                    if (notifyText.trim()) {
                      session.sendNotify(notifyText.trim());
                      setNotifyText("");
                    }
                  }}
                  disabled={!notifyText.trim()}
                >
                  通知を送信
                </Button>
                <Button
                  size="2"
                  variant="soft"
                  color="gray"
                  onClick={() => session.clearNotify()}
                  disabled={!session.notification}
                >
                  通知をクリア
                </Button>
              </Flex>
            </Flex>
          </Card>

          {/* ウェーブコントロール */}
          <Card>
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <ActivityLogIcon />
                <Text size="2" weight="bold">ウェーブ</Text>
              </Flex>
              <Button
                size="2"
                variant={session.waveEnabled ? "solid" : "outline"}
                color={session.waveEnabled ? "green" : "gray"}
                onClick={() => session.toggleWave(!session.waveEnabled)}
              >
                {session.waveEnabled ? "ウェーブON" : "ウェーブOFF"}
              </Button>
              {session.waveEnabled && session.waveData.length > 0 && (
                <Flex direction="column" gap="1">
                  {session.waveData.map((w) => (
                    <Text key={w.waveType} size="1" color="gray">
                      タイプ{w.waveType + 1}: {w.count}人 / {w.period.toFixed(2)}秒
                    </Text>
                  ))}
                </Flex>
              )}
            </Flex>
          </Card>

          {/* 背景色コントロール */}
          <Card>
            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">背景色</Text>
              <Flex align="center" gap="3">
                <input
                  type="color"
                  value={session.bgColor}
                  onChange={(e) => session.setBgColor(e.target.value)}
                  className={css({
                    width: "40px",
                    height: "32px",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: "transparent",
                  })}
                />
                <Text size="1" color="gray">{session.bgColor}</Text>
              </Flex>
              <Flex gap="2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => session.setBgColor(color)}
                    title={color}
                    className={css({
                      width: "28px",
                      height: "28px",
                      borderRadius: "4px",
                      border: session.bgColor === color ? "2px solid #f33968" : "2px solid rgba(255,255,255,0.15)",
                      backgroundColor: color,
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                      "&:hover": { borderColor: "#f33968" },
                    })}
                  />
                ))}
              </Flex>
            </Flex>
          </Card>
        </Box>
      </Flex>

      {/* QRコードダイアログ */}
      <Dialog.Root open={qrOpen} onOpenChange={setQrOpen}>
        <Dialog.Content maxWidth="360px">
          <Dialog.Title>観客用QRコード</Dialog.Title>
          <Flex direction="column" align="center" gap="4" py="3">
            <QRCodeSVG value={audienceUrl} size={220} bgColor="#ffffff" fgColor="#000000" />
            <Text
              size="2"
              className={css({ userSelect: "all", wordBreak: "break-all", textAlign: "center" })}
            >
              {audienceUrl}
            </Text>
          </Flex>
          <Separator size="4" />
          <Flex align="center" gap="2" justify="center">
            <Text size="2" color="gray">セッションID:</Text>
            <Text size="2" weight="bold" className={css({ fontFamily: "monospace" })}>
              {sessionId}
            </Text>
            <IconButton
              size="1"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(sessionId!);
                setIdCopied(true);
                setTimeout(() => setIdCopied(false), 2000);
              }}
              title="IDをコピー"
            >
              {idCopied ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
          </Flex>
          <Flex justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">閉じる</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* キック確認ダイアログ */}
      <Dialog.Root open={!!kickTarget} onOpenChange={(open) => !open && setKickTarget(null)}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>ユーザーをキック</Dialog.Title>
          <Dialog.Description size="2">
            ユーザー「{kickTarget?.slice(0, 6)}」をキックしますか？このユーザーは再接続できなくなります。
          </Dialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">キャンセル</Button>
            </Dialog.Close>
            <Button
              color="red"
              onClick={() => {
                if (kickTarget) {
                  session.kickUser(kickTarget);
                  setKickTarget(null);
                }
              }}
            >
              キック
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
    </Box>
  );
}
