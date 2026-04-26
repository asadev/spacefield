import type { Tool } from "@/lib/tools-data";

interface ToolIconProps {
  tool: Tool;
  opacity?: number;
  size?: number;
}

export default function ToolIcon({
  tool,
  opacity = 0.55,
  size = 40,
}: ToolIconProps) {
  const borderSize = size;
  const iconSize = size * 0.45;

  return (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: borderSize,
        height: borderSize,
        opacity,
        border: "1px solid color-mix(in srgb, var(--text) 18%, transparent)",
        background: "color-mix(in srgb, var(--text) 6%, transparent)",
      }}
    >
      {tool.svg ? (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ width: iconSize, height: iconSize }}
          className="text-app"
        >
          <path d={tool.svg} />
        </svg>
      ) : (
        <span
          className="font-mono font-medium text-app"
          style={{ fontSize: size * 0.3 }}
        >
          {tool.abbr}
        </span>
      )}
    </div>
  );
}
