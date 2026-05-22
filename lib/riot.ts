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
  const apiKey = process.env.RIOT_API_KEY?.trim();
  if (!apiKey) throw new Error("RIOT_API_KEY is not configured");

  const res = await fetch(url, {
    headers: { "X-Riot-Token": apiKey },
    next: { revalidate: 0 },
  });

  if (res.status === 401) throw new Error("RIOT_API_KEY is invalid or expired");
  if (res.status === 403) throw new Error("RIOT_API_KEY is invalid or expired");
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

export function getRouting(region: Region): string {
  return ROUTING[region] ?? "americas";
}

// Champion mastery — top N most played champions
export async function getTopMasteries(puuid: string, region: Region, count = 5) {
  const data = await riotFetch(
    `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`
  );
  return data as Array<{
    championId: number;
    championLevel: number;
    championPoints: number;
  }> | null;
}

// Match v5 — recent match IDs optionally filtered by champion
export async function getMatchIds(
  puuid: string,
  routing: string,
  options: { championId?: number; count?: number } = {}
) {
  const params = new URLSearchParams({ count: String(options.count ?? 10) });
  if (options.championId) params.set("champion", String(options.championId));

  const data = await riotFetch(
    `https://${routing}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`
  );
  return data as string[] | null;
}

export interface MatchParticipant {
  puuid: string;
  championName: string;
  championId: number;
  teamId: number;
  teamPosition: string;
  win: boolean;
}

export interface MatchDto {
  metadata: { matchId: string; participants: string[] };
  info: {
    participants: MatchParticipant[];
  };
}

// Match v5 — full match details
export async function getMatch(matchId: string, routing: string) {
  const data = await riotFetch(
    `https://${routing}.api.riotgames.com/lol/match/v5/matches/${matchId}`
  );
  return data as MatchDto | null;
}

// League v4 — ranked entries for a summoner
export interface LeagueEntry {
  queueType: string;   // "RANKED_SOLO_5x5" | "RANKED_FLEX_SR"
  tier: string;        // "IRON" | "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" | "EMERALD" | "DIAMOND" | "MASTER" | "GRANDMASTER" | "CHALLENGER"
  rank: string;        // "I" | "II" | "III" | "IV"
  leaguePoints: number;
  wins: number;
  losses: number;
}

export async function getRankedEntries(summonerId: string, region: Region): Promise<LeagueEntry[] | null> {
  const data = await riotFetch(
    `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`
  );
  return data as LeagueEntry[] | null;
}
