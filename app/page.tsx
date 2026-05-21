import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import AdUnit from "@/components/AdUnit";
import { Swords, Users, Zap } from "lucide-react";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/queue");

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className="text-center mb-16 space-y-4">
        <h1 className="text-5xl md:text-6xl font-bold">
          <span className="text-gold-400">Duel</span><span className="text-white">r</span>
          <br />
          <span className="text-gray-300 text-3xl md:text-4xl font-normal">1v1 Matchmaking for League of Legends</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-lg">
          Struggling into a specific champion? Find a real opponent to practice against.
          Queue as your champion, pick who you want to face, and get matched instantly.
        </p>
      </div>

      {/* Leaderboard banner ad — below hero, above content */}
      <AdUnit slot="YOUR_SLOT_ID_1" format="horizontal" className="w-full h-24 mb-10" />

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Login card */}
        <div className="card">
          <h2 className="text-xl font-bold mb-6 text-white">Connect Your Account</h2>
          <LoginForm />
        </div>

        {/* Feature highlights */}
        <div className="space-y-4">
          {[
            {
              icon: <Swords className="w-5 h-5 text-gold-400" />,
              title: "Champion-specific Matchmaking",
              desc: "Queue as Darius, say you want to face Jax — we find you a Jax player who wants to face Darius.",
            },
            {
              icon: <Users className="w-5 h-5 text-gold-400" />,
              title: "Elo-matched Practice",
              desc: "Pick your elo bracket (Low / Mid / High / Elite) to find an opponent at your skill level.",
            },
            {
              icon: <Zap className="w-5 h-5 text-gold-400" />,
              title: "Instant Connect",
              desc: "Once matched, you'll see your opponent's Riot ID so you can send a friend request and start a custom game immediately.",
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

{/* Rectangle ad — bottom of right column */}
          <AdUnit slot="YOUR_SLOT_ID_2" format="rectangle" className="w-full h-64" />
        </div>
      </div>
    </div>
  );
}
