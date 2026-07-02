import { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useParams, useLocation, useBlocker } from "react-router";
import { css } from "~/styled-system/css";
import { useSession } from "~/lib/use-party";
import { formatTime, parseColorCommand, getUserId, getAudienceUrl, getStoredAdminToken, storeAdminToken } from "~/lib/utils";
import { ENDING_GRACE_MS } from "~/lib/protocol";
import { QRCodeSVG } from "qrcode.react";
import {
  Button,
  Dialog,
  TextArea,
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
  Link2Icon,
  LockClosedIcon,
  ExitIcon,
} from "@radix-ui/react-icons";

const PRESET_COLORS = ["#000000", "#252525", "#1a1a3e", "#1a3e1a"];
const MAX_DISPLAY_COMMENTS = 200;

// アドオンのオーバーレイに中継するQRコードをSVG文字列として生成する
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

// msミリ秒だけtrueになるフィードバック用フラグ
function useTimedFlag(ms: number): [boolean, () => void] {
  const [flag, setFlag] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  const trigger = useCallback(() => {
    setFlag(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFlag(false), ms);
  }, [ms]);
  return [flag, trigger];
}

export default function Admin() {
  const { sessionId } = useParams();

  const [adminToken] = useState(() => {
    // 共有リンクで開いた場合はURLのトークンを優先し、古い保存値を上書きする
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      storeAdminToken(sessionId!, urlToken);
      window.history.replaceState({}, "", `/${sessionId}/admin`);
      return urlToken;
    }
    return getStoredAdminToken(sessionId!) || "";
  });

  if (!adminToken) {
    return (
      <Flex align="center" justify="center" className={css({ height: "100vh", backgroundColor: "#1e1e2e" })}>
        <Card>
          <Flex direction="column" align="center" gap="3" p="4">
            <Text size="4" weight="bold">管理者トークンがありません</Text>
            <Text size="2" color="gray">このセッションの管理者権限がないか、別のブラウザで作成されたセッションです。</Text>
          </Flex>
        </Card>
      </Flex>
    );
  }

  return <AdminSession sessionId={sessionId!} adminToken={adminToken} />;
}

function AdminSession({ sessionId, adminToken }: { sessionId: string; adminToken: string }) {
  const location = useLocation();
  const initialName = (location.state as { name?: string })?.name || "";
  const [userId] = useState(() => getUserId());
  const session = useSession(sessionId, "admin", userId, initialName, adminToken);

  const [notifyText, setNotifyText] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [idCopied, flashIdCopied] = useTimedFlag(2000);
  const [addonSynced, flashAddonSynced] = useTimedFlag(2000);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, flashShareCopied] = useTimedFlag(2000);
  const [endOpen, setEndOpen] = useState(false);
  const [endedDialogOpen, setEndedDialogOpen] = useState(false);

  const isLastAdmin = session.adminCount <= 1;

  useEffect(() => {
    if (session.ended) {
      setEndOpen(false);
      setEndedDialogOpen(true);
    }
  }, [session.ended]);

  useEffect(() => {
    if (session.ended || !isLastAdmin) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isLastAdmin, session.ended]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !session.ended && isLastAdmin && currentLocation.pathname !== nextLocation.pathname,
  );

  const isConnected = session.connectionStatus === WebSocket.OPEN;
  const audienceUrl = getAudienceUrl(sessionId!);
  const shareUrl = `${window.location.origin}/${sessionId}/admin?token=${adminToken}`;
  const endedStyle = session.ended ? { opacity: 0.4, pointerEvents: "none" as const } : undefined;

  const reversedComments = [...session.comments].reverse().slice(0, MAX_DISPLAY_COMMENTS);

  return (
    <Box className={css({ height: "100vh", overflow: "hidden", backgroundColor: "#1e1e2e" })}>
    <Flex direction="column" p="4" className={css({ maxWidth: "1200px", margin: "0 auto", height: "100vh", overflow: "hidden" })}>
      {/* トップバー */}
      <Card mb="3">
        <Flex align="center" justify="between" wrap="wrap" gap="3">
          <Flex align="center" gap="3">
            <Box
              className={css({
                position: "relative",
                width: "10px",
                height: "10px",
                flexShrink: 0,
              })}
            >
              <Box
                className={css({
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  backgroundColor: session.ended ? "#6b7280" : isConnected ? "#22c55e" : "#ef4444",
                })}
              />
              {isConnected && !session.ended && (
                <>
                  <Box
                    className={css({
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      backgroundColor: "#22c55e",
                      animation: "ripple 2.4s ease-out infinite",
                    })}
                  />
                  <Box
                    className={css({
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      backgroundColor: "#22c55e",
                      animation: "ripple 2.4s ease-out 1.2s infinite",
                    })}
                  />
                </>
              )}
            </Box>
            <Text size="4" weight="bold">
              {session.sessionName || sessionId}
            </Text>
            {session.ended && (
              <Badge size="2" color="red" variant="solid">終了済み</Badge>
            )}
          </Flex>
          <Flex gap="2" wrap="wrap" style={endedStyle}>
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
                  // アドオンのオーバーレイはQRを自前生成できないため、SVGを添えて中継してもらう
                  session.toggleQr(true, generateQrSvg(audienceUrl));
                }
              }}
            >
              画面にQR{session.qrVisible ? "ON" : "OFF"}
            </Button>
            <Button variant="soft" onClick={() => setShareOpen(true)}>
              <LockClosedIcon />
              管理URLを共有
            </Button>
            <Button variant="soft" color="red" onClick={() => setEndOpen(true)}>
              <ExitIcon />
              セッション終了
            </Button>
            <Button
              variant={addonSynced ? "solid" : "soft"}
              color={addonSynced ? "green" : undefined}
              onClick={() => {
                window.postMessage({
                  type: "adhoc-nico:sync",
                  sessionId,
                  sessionName: session.sessionName || initialName || "",
                }, "*");
                flashAddonSynced();
              }}
              title="ブラウザアドオンにセッション情報を送信します"
            >
              <Link2Icon />
              {addonSynced ? "送信しました" : "オーバーレイ連携"}
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
        <Flex direction="column" className={css({ flex: 1, minHeight: 0 })}>
          <Text size="2" weight="bold" mb="2">
            コメント ({session.comments.length})
          </Text>
          <Box
            className={css({
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              borderRadius: "var(--radius-4)",
              backgroundColor: "var(--color-panel-translucent)",
              boxShadow: "inset 0 0 0 1px var(--gray-a5)",
            })}
          >
              {reversedComments.length === 0 ? (
                <Flex align="center" justify="center" className={css({ height: "100%", padding: "16px" })}>
                  <Text size="2" color="gray" className={css({ textAlign: "center" })}>
                    コメントはまだありません
                  </Text>
                </Flex>
              ) : (
                <Flex direction="column" gap="1" className={css({ padding: "8px" })}>
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
                        {parseColorCommand(c.text).body}
                      </Text>
                      {!session.ended && (
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
                      )}
                    </Flex>
                  ))}
                </Flex>
              )}
          </Box>
        </Flex>

        {/* サイドパネル */}
        <Flex direction="column" className={css({ width: { base: "100%", lg: "320px" }, flexShrink: 0, gap: "12px", overflow: "auto" })} style={endedStyle}>
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
        </Flex>
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
                flashIdCopied();
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

      {/* 管理URL共有ダイアログ */}
      <Dialog.Root open={shareOpen} onOpenChange={setShareOpen}>
        <Dialog.Content maxWidth="480px">
          <Dialog.Title>管理URLを共有</Dialog.Title>
          <Dialog.Description size="2" color="orange" mb="3">
            このリンクには管理者トークンが含まれます。共有先にはセッションの全操作権限が付与されます。
          </Dialog.Description>
          <Card variant="surface">
            <Text
              size="2"
              className={css({ fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" })}
            >
              {shareUrl}
            </Text>
          </Card>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">閉じる</Button>
            </Dialog.Close>
            <Button
              variant={shareCopied ? "solid" : "outline"}
              color={shareCopied ? "green" : undefined}
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                flashShareCopied();
              }}
            >
              {shareCopied ? <CheckIcon /> : <CopyIcon />}
              {shareCopied ? "コピーしました" : "コピー"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* セッション終了確認ダイアログ */}
      <Dialog.Root open={endOpen} onOpenChange={setEndOpen}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>セッションを終了</Dialog.Title>
          <Dialog.Description size="2">
            セッションを終了すると、すべての観客とスクリーンが切断されます。この操作は取り消せません。
          </Dialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">キャンセル</Button>
            </Dialog.Close>
            <Button color="red" onClick={() => session.endSession()}>
              終了する
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* セッション終了完了ダイアログ */}
      <Dialog.Root open={endedDialogOpen} onOpenChange={setEndedDialogOpen}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>セッションが終了しました</Dialog.Title>
          <Dialog.Description size="2">
            すべての観客とスクリーンが切断されました。コメント履歴はこのページで引き続き確認できます。
          </Dialog.Description>
          <Flex justify="end" mt="4">
            <Dialog.Close>
              <Button variant="soft">閉じる</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* ナビゲーション確認ダイアログ */}
      <Dialog.Root open={blocker.state === "blocked"} onOpenChange={(open) => !open && blocker.reset?.()}>
        <Dialog.Content maxWidth="400px">
          <Dialog.Title>ページを離れますか？</Dialog.Title>
          <Dialog.Description size="2">
            最後の管理者です。ページを離れるとセッションは{ENDING_GRACE_MS / 60_000}分後に自動終了します。
          </Dialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <Button variant="soft" color="gray" onClick={() => blocker.reset?.()}>
              キャンセル
            </Button>
            <Button color="red" onClick={() => blocker.proceed?.()}>
              離れる
            </Button>
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
    </Flex>
    </Box>
  );
}
