"use client";

import * as React from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silencioso
    }
  }

  return (
    <button type="button" onClick={handleCopy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
