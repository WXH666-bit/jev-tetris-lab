import { useState } from "react";
import { redact } from "../../../shared/lab/redact";
import { Copy } from "lucide-react";
export function JsonViewer({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="json">
      <summary>
        {label}
        <span className="muted">JSON</span>
      </summary>
      <button
        className="copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              JSON.stringify(redact(value ?? null), null, 2),
            );
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={12} />
        {copied ? "已复制" : "复制脱敏 JSON"}
      </button>
      <pre>
        {value === undefined || value === null
          ? "未提供"
          : JSON.stringify(redact(value), null, 2)}
      </pre>
    </details>
  );
}
