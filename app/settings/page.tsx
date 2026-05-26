import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import SettingsForm from "@/components/SettingsForm";
import { Settings } from "lucide-react";

export const metadata = { title: "Settings · Duelr" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-6 h-6 text-gold-400" />
        <h1 className="text-2xl font-bold text-white font-display tracking-wide">
          Account <span className="text-amber-400">Settings</span>
        </h1>
      </div>

      <SettingsForm
        riotId={session.user.riotId}
        region={session.user.region}
        email={session.user.email ?? null}
        accountType={session.user.accountType}
        emailVerified={session.user.emailVerified ?? false}
      />
    </div>
  );
}
