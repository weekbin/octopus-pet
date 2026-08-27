// Bubble.tsx — Speech bubble above the octopus head.
// ≤ 12 chars (FSM truncates). Styles in global.css under `.bubble` / `.bubble::after`.

interface BubbleProps {
  text: string;
}

export function Bubble({ text }: BubbleProps) {
  return (
    <div className="bubble">
      {text}
    </div>
  );
}

