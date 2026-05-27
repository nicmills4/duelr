"use client";

import { Lock } from "lucide-react";

interface Props {
  accountType: "none" | "guest" | "full";
  /** Feature label shown in the gate UI, e.g. "Practice Partners" */
  featureName: string;
  children: React.ReactNode;
}

/**
 * Shows a call-to-action for guests and logged-out users in place of gated content.
 * Full-account holders see the children directly.
 */
export default function AccountGate({ accountType, featureName, children }: Props) {
  if (accountType === "full") return <>{children}</>;

  const isGuest   = accountType === "guest";
  const loginUrl  = "/?tab=login";
  const signupUrl = "/?tab=signup";

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
      <div className="w-14 h-14 rounded-full bg-dark-700 border border-dark-600 flex items-center justify-center">
        <Lock className="w-6 h-6 text-amber-400" />
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-bold text-white">{featureName} requires a free account</h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          {isGuest
            ? "You're browsing as a guest. Create a free account to unlock Coaching and more."
            : "Create a free account or log in to unlock this feature."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href={signupUrl}
          className="btn-primary px-6 py-2 text-sm"
        >
          Create Free Account
        </a>
        {isGuest && (
          <a
            href={loginUrl}
            className="btn-secondary px-6 py-2 text-sm"
          >
            Log In
          </a>
        )}
      </div>

      {!isGuest && (
        <p className="text-xs text-gray-500">
          Already have an account?{" "}
          <a href={loginUrl} className="text-amber-400 hover:underline">Log in</a>
        </p>
      )}
    </div>
  );
}
