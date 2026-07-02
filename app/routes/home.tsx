import { useState } from "react";
import { useNavigate } from "react-router";
import { Dialog, Button, TextField } from "@radix-ui/themes";
import { css } from "~/styled-system/css";
import { generateSessionId, generateAdminToken, storeAdminToken } from "~/lib/utils";

// 背景アニメーション
const bgStyle = css({
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #0a0015, #1a0030, #000a1a, #001a0a, #1a0030, #0a0015)",
  backgroundSize: "400% 400%",
  animation: "rainbow 8s ease infinite",
  position: "relative",
  overflow: "hidden",
});

// グリッド線の装飾
const gridOverlay = css({
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(0,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "60px 60px",
  pointerEvents: "none",
});

// 走査線エフェクト
const scanlineOverlay = css({
  position: "absolute",
  inset: 0,
  background:
    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.015) 2px, rgba(0,255,255,0.015) 4px)",
  pointerEvents: "none",
});

// ネオンタイトル
const titleStyle = css({
  fontSize: "clamp(2.2rem, 8vw, 5rem)",
  fontWeight: 900,
  color: "#fff",
  animation: "neonPulse 3s ease-in-out infinite",
  letterSpacing: "0.08em",
  textAlign: "center",
  zIndex: 1,
});

// サブタイトル
const subtitleStyle = css({
  fontSize: "clamp(0.9rem, 3vw, 1.3rem)",
  color: "rgba(0,255,255,0.7)",
  marginTop: "0.8rem",
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  textShadow: "0 0 8px rgba(0,255,255,0.5)",
  zIndex: 1,
  textAlign: "center",
});

// ホログラフィック装飾線
const holoLineStyle = css({
  width: "min(80%, 400px)",
  height: "2px",
  margin: "2rem auto",
  background: "linear-gradient(90deg, transparent, #ff00ff, #00ffff, #39ff14, #ff00ff, transparent)",
  backgroundSize: "200% 100%",
  animation: "rainbow 3s linear infinite",
  zIndex: 1,
});

// CTAボタン
const ctaBtnStyle = css({
  fontSize: "clamp(1rem, 2.5vw, 1.2rem)!important",
  padding: "1rem 2.5rem!important",
  background: "linear-gradient(135deg, #ff00ff, #8b00ff, #00ffff)!important",
  backgroundSize: "200% 200%!important",
  animation: "rainbow 4s ease infinite",
  color: "#fff!important",
  fontWeight: "700!important",
  borderRadius: "9999px!important",
  border: "none!important",
  cursor: "pointer!important",
  boxShadow: "0 0 15px rgba(255,0,255,0.4), 0 0 30px rgba(0,255,255,0.2)!important",
  transition: "transform 0.2s, box-shadow 0.2s!important",
  zIndex: 1,
  _hover: {
    transform: "scale(1.05)",
    boxShadow: "0 0 25px rgba(255,0,255,0.6), 0 0 50px rgba(0,255,255,0.4)!important",
  },
});

// 浮遊パーティクル
const particleBase = css({
  position: "absolute",
  borderRadius: "50%",
  pointerEvents: "none",
  opacity: 0.4,
});

export default function Home() {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // セッション作成して管理画面へ遷移
  const handleCreate = () => {
    if (!name.trim()) return;
    const id = generateSessionId();
    const token = generateAdminToken();
    storeAdminToken(id, token);
    navigate(`/${id}/admin`, { state: { name: name.trim() } });
  };

  return (
    <div className={bgStyle}>
      <div className={gridOverlay} />
      <div className={scanlineOverlay} />

      {/* 浮遊する装飾パーティクル */}
      {[
        { top: "15%", left: "10%", w: 6, color: "#ff00ff", dur: "6s" },
        { top: "25%", right: "15%", w: 4, color: "#00ffff", dur: "8s" },
        { top: "70%", left: "20%", w: 5, color: "#39ff14", dur: "7s" },
        { top: "60%", right: "25%", w: 3, color: "#ff00ff", dur: "5s" },
        { top: "80%", left: "70%", w: 7, color: "#00ffff", dur: "9s" },
      ].map((p, i) => (
        <div
          key={i}
          className={particleBase}
          style={{
            top: p.top,
            left: "left" in p ? p.left : undefined,
            right: "right" in p ? p.right : undefined,
            width: p.w,
            height: p.w,
            background: p.color,
            boxShadow: `0 0 ${p.w * 3}px ${p.color}`,
            animation: `neonPulse ${p.dur} ease-in-out infinite`,
          }}
        />
      ))}

      <h1 className={titleStyle}>アドホック・ニコ</h1>
      <div className={holoLineStyle} />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger>
          <button className={ctaBtnStyle}>
            はじめる
          </button>
        </Dialog.Trigger>
        <Dialog.Content maxWidth="420px">
          <Dialog.Title>セッションを作成</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            イベントやセッションの名前を入力してください
          </Dialog.Description>
          <TextField.Root
            placeholder="例: 社内LT大会 2076"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Dialog.Close>
              <Button variant="soft" color="gray">キャンセル</Button>
            </Dialog.Close>
            <Button onClick={handleCreate}>作成</Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
