import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import QueueForm from "@/components/QueueForm";
import LogoutButton from "@/components/LogoutButton";
import AdUnit from "@/components/AdUnit";
import SuggestedMatchups from "@/components/SuggestedMatchups";
import PopularChampions from "@/components/PopularChampions";

export default async function QueuePage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Find a Match</h1>
          <p className="text-sm text-gray-400 mt-1">
            Logged in as <span className="text-gold-400 font-medium">{session.user.riotId}</span>
            {" · "}
            <span className="uppercase text-gray-500 text-xs">{session.user.region}</span>
          </p>
        </div>
        <LogoutButton />
      </div>

      {/* Wrap in Suspense because QueueForm uses useSearchParams */}
      <Suspense>
        <QueueForm riotId={session.user.riotId} />
      </Suspense>

      {/* Champions currently in queue */}
      <div className="mt-6">
        <PopularChampions />
      </div>

      {/* Suggested matchups based on match history */}
      <SuggestedMatchups />

      {/* Banner ad below */}
      <AdUnit slot="YOUR_SLOT_ID_3" format="horizontal" className="w-full h-24 mt-8 max-w-lg mx-auto" />
    </div>
  );
}
