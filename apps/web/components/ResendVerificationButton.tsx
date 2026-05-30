"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function ResendVerificationButton({ className = "" }: { className?: string }) {
  const [state,   setState]   = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    const res  = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setState("sent");
    } else {
      setState("error");
      setMessage(data.error ?? "Failed");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  if (state === "sent") {
    return <span className={`text-emerald-400 text-xs font-medium ${className}`}>✓ Email sent!</span>;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="text-xs underline underline-offset-2 hover:opacity-80 transition-opacity disabled:opacity-50 whitespace-nowrap"
      >
        {state === "loading"
          ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Sending…</span>
          : "Resend email"}
      </button>
      {state === "error" && <span className="text-xs text-red-300">{message}</span>}
    </div>
  );
}
