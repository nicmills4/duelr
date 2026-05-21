export type Region = "na1" | "euw1" | "eune" | "kr" | "jp1" | "br1" | "la1" | "la2" | "oce";

const ROUTING: Record<Region, string> = {
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  euw1: "europe",
  eune: "europe",
  kr: "asia",
  jp1: "asia",
  oce: "sea",
};

export const REGIONS: { value: Region; label: string }[] = [
  { value: "na1", label: "NA" },
  { value: "euw1", label: "EUW" },
  { value: "eune", label: "EUNE" },
  { value: "kr", label: "KR" },
  { value: "jp1", label: "JP" },
  { value: "br1", label: "BR" },
  { value: "la1", label: "LAN" },
  { value: "la2", label: "LAS" },
  { value: "oce", label: "OCE" },
];

async function riotFetch(url: string) {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) throw new Error("RIOT_API_KEY is not configured");

  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
    next: { revalidate: 0 },
  });

  if (res.status === 404) return null;
  if (res.status === 429) throw new Error("Rate limited by Riot API — try again shortly");
  if (!res.ok) throw new Error(`Riot API error ${res.status}`);

  return res.json();
}

export async function getAccountByRiotId(gameName: string, tagLine: string, region: Region) {
  const routing = ROUTING[region] ?? "americas";
  const data = await riotFetch(
    `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  );
  return data as { puuid: string; gameName: string; tagLine: string } | null;
}

export async function getSummonerByPuuid(puuid: string, region: Region) {
  const data = await riotFetch(
    `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
  );
  return data as { id: string; accountId: string; name: string; profileIconId: number; summonerLevel: number } | null;
}

// Parse "GameName#TAG" → { gameName, tagLine }
export function parseRiotId(raw: string): { gameName: string; tagLine: string } | null {
  const idx = raw.lastIndexOf("#");
  if (idx === -1 || idx === 0 || idx === raw.length - 1) return null;
  return { gameName: raw.slice(0, idx).trim(), tagLine: raw.slice(idx + 1).trim() };
}
