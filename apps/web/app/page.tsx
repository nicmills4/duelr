import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { Swords, Users, Zap, ShieldCheck } from "lucide-react";
import LivePlayerCount from "@/components/LivePlayerCount";
import LobbyPreview from "@/components/LobbyPreview";

type ValidTab = "guest" | "signup" | "login";
const VALID_TABS = new Set<string>(["guest", "signup", "login"]);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  if (session) redirect("/lobby");

  const defaultTab: ValidTab = VALID_TABS.has(sp.tab ?? "")
    ? (sp.tab as ValidTab)
    : "guest";

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-16 space-y-4">
        <h1 className="font-display text-7xl md:text-8xl tracking-wide">
          <span className="text-amber-400">Duel</span><span className="text-white">r</span>
          <br />
          <span className="text-gray-300 text-2xl md:text-3xl font-sans font-normal tracking-normal">Matchmaking for League of Legends</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-lg">
          The practice tool League players actually need. Jump into the Open Lobby,
          see who&apos;s ready to play, and send a direct 1v1 challenge in seconds.
        </p>
        <LivePlayerCount className="justify-center" />
      </div>

      <LobbyPreview />

      <div className="grid md:grid-cols-2 gap-8 items-start mt-10">
        {/* Login card */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-xl font-bold mb-6 text-white">Get Started</h2>
            <LoginForm defaultTab={defaultTab} />
          </div>

          {/* Security disclaimer */}
          <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-4 text-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-400 mb-1">Zero compromise risk — your account stays yours.</p>
              <p className="text-gray-400 leading-relaxed">
                Duelr does <span className="text-gray-200 font-medium">not</span> ask for your Riot password
                and has no access to your account. You simply enter your Riot ID
                (e.g. <span className="text-gray-300">Faker#KR1</span>) — it&apos;s used only
                to look up your rank and show your name to matched opponents. Nothing is stored beyond your public summoner info.
              </p>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="space-y-4">
          {[
            {
              icon: <Users className="w-5 h-5 text-gold-400" />,
              title: "Open Lobby",
              desc: "Mark yourself available and get challenged directly — instant, no waiting around. See who else is online and send a 1v1 request in seconds.",
            },
            {
              icon: <Swords className="w-5 h-5 text-gold-400" />,
              title: "Preferred Matchups",
              desc: "List the champions you most want to face on your lobby, so opponents can pick the practice you're after. Filter the player list by champion, role, and elo.",
            },
            {
              icon: <Zap className="w-5 h-5 text-gold-400" />,
              title: "Instant Connect",
              desc: "The moment a challenge is accepted, you get your opponent's Riot ID on the spot — add them, create a custom game, and play.",
            },
          ].map((f) => (
            <div key={f.title} className="card flex gap-4">
              <div className="mt-0.5 flex-shrink-0">{f.icon}</div>
              <div>
                <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-sm text-gray-400">{f.desc}</p>
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
