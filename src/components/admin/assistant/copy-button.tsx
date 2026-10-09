"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/** One-click copy of a prepared contact-form message. Never submits anything. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      size="sm"
      type="button"
      variant="secondary"
    >
      {copied ? "Copied!" : label}
    </Button>
  );
}
