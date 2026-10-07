"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** One-click copy of the generated WhatsApp digest text. */
export function DigestCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        } catch {
          setCopied(false);
        }
      }}
      type="button"
    >
      {copied ? "Copied!" : "Copy digest"}
    </Button>
  );
}
