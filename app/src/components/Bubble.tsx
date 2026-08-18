// Bubble.tsx — Speech bubble above the octopus head.
// ≤ 12 Chinese characters per plan §1.9.2 — but CJK glyphs are 2x width, so we
// limit to 6 CJK chars / 12 ASCII chars effectively. We don't enforce here; the FSM
// truncates at 12.

interface BubbleProps {
  text: string;
}

export function Bubble({ text }: BubbleProps) {
  return (
    <div
      className="bubble"
      style={{
        position: "absolute",
        top: -8,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(255, 255, 255, 0.95)",
        color: "#222",
        padding: "6px 12px",
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 500,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        pointerEvents: "none",
        animation: "bubble-pop 0.18s ease-out",
        zIndex: 10,
      }}
    >
      {text}
      <span
        style={{
          position: "absolute",
          bottom: -6,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "6px solid rgba(255, 255, 255, 0.95)",
        }}
      />
    </div>
  );
}
