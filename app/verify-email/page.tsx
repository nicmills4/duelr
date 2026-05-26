"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token");

  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("No verification token found in the link.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json();
        if (res.ok) {
          setState("success");
          router.refresh(); // update session cache → banner disappears
        } else {
          setState("error");
          setMessage(data.error ?? "Verification failed.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Network error — please try again.");
      });
  }, [token, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="card max-w-sm w-full text-center space-y-4">
        {state === "loading" && (
          <>
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
            <p className="text-gray-400 text-sm">Verifying your email…</p>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Email Verified!</h2>
            <p className="text-gray-400 text-sm">
              Your account is fully active. You&apos;re all set.
            </p>
            <a href="/lobby" className="btn-primary w-full flex items-center justify-center text-sm">
              Go to Lobby
            </a>
          </>
        )}

        {state === "error" && (
          <>
            <XCircle className="w-10 h-10 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Verification Failed</h2>
            <p className="text-gray-400 text-sm">{message}</p>
            <p className="text-xs text-gray-500">
              Links expire after 24 hours.{" "}
              <a href="/settings" className="text-amber-400 hover:underline">
                Resend from Settings
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
