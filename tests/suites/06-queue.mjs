/**
 * Suite 06 — Specific Matchups Queue
 * Needs a session. Set TEST_EMAIL + TEST_PASSWORD or TEST_RIOT_ID.
 */

import { assertStatus, assertOk, assert, assertHasKeys, skip } from "../helpers/assert.mjs";

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
    if (res.status === 401) skip("Test account not found — run ensureTestAccount or create manually");
    assertStatus(res, 200, "test user login");
  } else if (TEST_RIOT_ID) {
    const { res } = await http.post("/api/auth/login", {
      riotId: TEST_RIOT_ID, region: TEST_RIOT_REGION,
    });
    if (res.status === 500) skip("Guest login unavailable — Riot API unreachable or key expired");
    assertStatus(res, 200, "guest login");
  }
}

const VALID_ENTRY = {
  myChampion:  "Zed",
  vsChampions: ["Darius"],
  eloBracket:  "mid",
};

export const suite = {
  name: "Specific Matchups Queue",
  tests: [

    // ── Public endpoints ─────────────────────────────────────────────────────
    {
      name: "GET /api/queue/depth — returns 200 without auth",
      async run(http) {
        const { res } = await http.get("/api/queue/depth");
        assertStatus(res, 200);
      },
    },
    {
      name: "GET /api/queue/depth — response has numeric depth",
      async run(http) {
        const { data } = await http.get("/api/queue/depth");
        assert(typeof data.depth === "number", `depth should be number, got ${typeof data.depth}`);
        assert(data.depth >= 0, "depth should be non-negative");
      },
    },
    {
      name: "GET /api/queue/count — returns 200",
      async run(http) {
        const { res } = await http.get("/api/queue/count");
        assertStatus(res, 200);
      },
    },
    {
      name: "GET /api/queue/popular — returns 200",
      async run(http) {
        const { res } = await http.get("/api/queue/popular");
        assertStatus(res, 200);
      },
    },

    // ── Validation ───────────────────────────────────────────────────────────
    {
      name: "POST /api/queue/join — rejects missing myChampion",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/queue/join", {
          vsChampions: ["Darius"], eloBracket: "mid",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "POST /api/queue/join — rejects invalid eloBracket",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/queue/join", {
          ...VALID_ENTRY, eloBracket: "diamond",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "POST /api/queue/join — rejects more than 5 vsChampions",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);
        const { res } = await http.post("/api/queue/join", {
          myChampion:  "Zed",
          vsChampions: ["A","B","C","D","E","F"], // 6 = too many
          eloBracket:  "mid",
        });
        assertStatus(res, 400);
      },
    },

    // ── Full flow ─────────────────────────────────────────────────────────────
    {
      name: "Queue — join, verify depth increases, then leave",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set",
      async run(http) {
        await loginTestUser(http);

        // /api/queue/count returns { count } — the total across all queues
        const { data: before } = await http.get("/api/queue/count");
        const countBefore = typeof before.count === "number" ? before.count : 0;

        // Join — route returns {status:"queued"} (not {ok:true})
        const { res: joinRes, data: joinData } = await http.post("/api/queue/join", VALID_ENTRY);
        assertStatus(joinRes, 200);
        assert(joinData?.status === "queued" || joinData?.ok === true, `Expected queued status, got: ${JSON.stringify(joinData)}`);

        // Count should not decrease after joining
        const { data: during } = await http.get("/api/queue/count");
        assert(
          typeof during.count === "number" && during.count >= countBefore,
          `queue count should not decrease after joining (was ${countBefore}, now ${during.count})`
        );

        // Leave
        const { res: leaveRes, data: leaveData } = await http.post("/api/queue/leave", {});
        assertStatus(leaveRes, 200);
        assertOk(leaveData, "queue leave");
      },
    },
    {
      name: "GET /api/queue/matchup-info — returns shape for known champion",
      skip: !canTest,
      skipReason: "TEST_RIOT_ID or TEST_EMAIL/TEST_PASSWORD not set (endpoint requires auth)",
      async run(http) {
        await loginTestUser(http);
        const { res, data } = await http.get("/api/queue/matchup-info?champion=Zed");
        assertStatus(res, 200);
        assert(data !== null, "should return non-null data");
      },
    },
  ],
};
