// Adapted from Magic UI BlurFade (MIT), https://github.com/magicuidesign/magicui
// Copyright (c) 2023 Magic UI. Uses composited CSS entry transitions for YouBlock.
import type { ReactNode } from "react";

// Only occasional rule-editor entry animates. Keyboard and reduced-motion
// behavior is handled alongside the shared motion tokens in style.css.
export function BlurFade({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`editor-entry ${className}`}>{children}</div>;
}
