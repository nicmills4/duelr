"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} disabled={loading}
      className="btn-secondary flex items-center gap-2 text-sm whitespace-nowrap">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
      <span className="hidden sm:inline">Log out</span>
    </button>
  );
}
