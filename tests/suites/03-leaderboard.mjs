/**
 * Suite 03 — Leaderboard
 * Public endpoint, no auth required.
 */

import { assertStatus, assertArray, assertHasKeys, assert } from "../helpers/assert.mjs";

export const suite = {
  name: "Leaderboard",
  tests: [
    {
      name: "GET /api/leaderboard — returns 200",
      async run(http) {
        const { res } = await http.get("/api/leaderboard");
        assertStatus(res, 200);
      },
    },
    {
      name: "GET /api/leaderboard — response is an array",
      async run(http) {
        const { data } = await http.get("/api/leaderboard");
        assertArray(data, "leaderboard");
      },
    },
    {
      name: "GET /api/leaderboard — each entry has required fields",
      async run(http) {
        const { data } = await http.get("/api/leaderboard");
        assertArray(data, "leaderboard");
        if (data.length > 0) {
          assertHasKeys(data[0], ["riotId", "wins", "losses"], "leaderboard entry");
        }
      },
    },
    {
      name: "GET /api/leaderboard — wins and losses are non-negative integers",
      async run(http) {
        const { data } = await http.get("/api/leaderboard");
        assertArray(data, "leaderboard");
        for (const entry of data) {
          assert(Number.isInteger(entry.wins)   && entry.wins   >= 0, `wins invalid: ${entry.wins}`);
          assert(Number.isInteger(entry.losses) && entry.losses >= 0, `losses invalid: ${entry.losses}`);
        }
      },
    },
    {
      name: "GET /api/leaderboard — second call also returns 200 (cache hit)",
      async run(http) {
        const { res: r1 } = await http.get("/api/leaderboard");
        const { res: r2 } = await http.get("/api/leaderboard");
        assertStatus(r1, 200);
        assertStatus(r2, 200);
      },
    },
  ],
};
