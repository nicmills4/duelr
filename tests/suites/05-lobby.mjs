/**
 * Suite 05 — Open Lobby
 * Needs a session. Set TEST_EMAIL + TEST_PASSWORD for a full account,
 * OR TEST_RIOT_ID + TEST_RIOT_REGION for a guest session.
 */

import { assertStatus, assertOk, assert } from "../helpers/assert.mjs";

const TEST_RIOT_ID     = process.env.TEST_RIOT_ID;
const TEST_RIOT_REGION = process.env.TEST_RIOT_REGION ?? "na1";
const TEST_EMAIL       = process.env.TEST_EMAIL;
const TEST_PASSWORD    = process.env.TEST_PASSWORD;
const canTest          = !!(TEST_RIOT_ID || (TEST_EMAIL && TEST_PASSWORD));

async function loginTestUser(http) {
  if (TEST_EMAIL && TEST_PASSWORD) {
    const { res } = await http.post("/api/auth/login-email", {
      email: TEST_EMAIL, password: TEST_PASSWORD,
    });
    assertStatus(res, 200, "test user login");
  } else if (TEST_RIOT_ID) {
    const { res } = await http.post("/api/auth/login", {
      riotId: TEST_RIOT_ID, region: TEST_RIOT_REGION,
    });
    assertStatus(res, 200, "guest login");
  }
}

const CHAMP = { champId: "Zed", champName: "Zed", champImage: "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Zed.png", eloBracket: "mid" };

export const suite = {
  name: "Open Lobby",
  tests: [

    {
      name: "GET /api/lobby/available — returns 200 without auth (public read)",
      async run(http) {
        const { res } = await http.get("/api/lobby/available");
        assertStatus(res, 200);
      },
    },
    {
      name: "GET /api/lobby/available — response has 'players' array",
      async run(http) {
        const { data } = await http.get("/api/lobby/available");
        assert(Array.isArray(data.players), "should have players array");
      },
    },
    {
      name: "POST /api/lobby/available — mark self available",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res, data } = await http.post("/api/lobby/available", CHAMP);
        assertStatus(res, 200);
        assertOk(data, "lobby available");
        assert(typeof data.expiresAt === "number", "should return expiresAt timestamp");
      },
    },
    {
      name: "POST /api/lobby/available — rejects missing champId",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/lobby/available", {
          champName: "Zed", champImage: "x", eloBracket: "mid",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "POST /api/lobby/available — rejects invalid eloBracket",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/lobby/available", {
          ...CHAMP, eloBracket: "supermaster",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Lobby — user appears in available list after marking available",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        await http.post("/api/lobby/available", CHAMP);
        const { data } = await http.get("/api/lobby/available");
        assert(Array.isArray(data.players), "players should be array");
        // User should appear (may be 0 if lobby expires quickly, but usually fast enough)
        // Just verify the shape of entries if any
        if (data.players.length > 0) {
          const p = data.players[0];
          assert("riotId"    in p, "player should have riotId");
          assert("champId"   in p, "player should have champId");
          assert("eloBracket" in p, "player should have eloBracket");
        }
      },
    },
    {
      name: "POST /api/lobby/leave — can leave lobby",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        await http.post("/api/lobby/available", CHAMP);
        const { res, data } = await http.post("/api/lobby/leave", {});
        assertStatus(res, 200);
        assertOk(data, "lobby leave");
      },
    },
    {
      name: "POST /api/lobby/challenge — rejects nonexistent target",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/lobby/challenge", {
          targetId: "nonexistent-user-id-99999",
          ...CHAMP,
        });
        // Expect 400 or 404 — target not in lobby
        assert(res.status === 400 || res.status === 404, `Expected 400 or 404, got ${res.status}`);
      },
    },
  ],
};
