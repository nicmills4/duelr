import { getSession } from "@/lib/session";
import { Suspense } from "react";
import LobbyBrowser from "@/components/LobbyBrowser";
import LogoutButton from "@/components/LogoutButton";
import SuggestedMatchups from "@/components/SuggestedMatchups";

export default async function LobbyPage() {
  const session = await getSession();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white font-display tracking-wide">
            Open <span className="text-amber-400">Lobby</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Mark yourself as available — other players can see you and send a direct challenge.
            No queue, no wait.
          </p>
          {session && (
            <p className="text-xs text-gray-600 mt-1">
              Logged in as{" "}
              <span className="text-gold-400 font-medium">{session.user.riotId}</span>
              {" · "}
              <span className="uppercase">{session.user.region}</span>
            </p>
          )}
        </div>
        {session ? (
          <LogoutButton />
        ) : (
          <a href="/" className="btn-secondary text-sm px-4 py-2 flex-shrink-0">
            Log in
          </a>
        )}
      </div>

      <Suspense>
        <LobbyBrowser
          riotId={session?.user.riotId ?? null}
          userId={session?.userId ?? null}
        />
      </Suspense>

      {session && <SuggestedMatchups />}
    </div>
  );
}
