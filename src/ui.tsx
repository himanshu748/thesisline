import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

export function Brand() {
  return (
    <a className="brand" href="#" aria-label="ThesisLine home">
      <svg
        width="26"
        height="28"
        viewBox="0 0 26 28"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 5H23M3 12H23M13 5V26"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        <path d="M3 20H8" stroke="currentColor" strokeWidth="2.6" />
      </svg>
      <span>
        ThesisLine<span className="brand-dot">.</span>
      </span>
    </a>
  );
}
export function Button({
  children,
  busy,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button {...props} aria-busy={busy || undefined} disabled={props.disabled || busy}>
      {busy && <LoaderCircle data-icon="inline-start" aria-hidden="true" className="spin" />}
      {children}
    </button>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="notice">
      {children}
    </p>
  );
}
export function stamp(value?: number | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(value) + " IST"
    : "Not checked yet";
}
export function errorText(error: unknown) {
  const text =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  return text
    .replace(/^.*Uncaught Error:\s*/, "")
    .replace(/\s+at handler[\s\S]*$/, "")
    .replace(/\[Request ID:[^\]]*\]\s*/, "")
    .replace(/Server Error\s*/, "")
    .slice(0, 400);
}
export const readings = {
  supports: "Supports the thesis",
  contradicts: "Challenges the thesis",
  unclear: "Still an open question",
};
