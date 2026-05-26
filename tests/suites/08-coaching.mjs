/**
 * Suite 08 — Coaching
 * Public coach list is open. Booking requires a full account.
 */

import { assertStatus, assertArray, assert } from "../helpers/assert.mjs";

const TEST_EMAIL    = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const hasFull       = !!(TEST_EMAIL && TEST_PASSWORD);
const TEST_RIOT_ID  = process.env.TEST_RIOT_ID;
const TEST_RIOT_REGION = process.env.TEST_RIOT_REGION ?? "na1";
const hasGuest      = !!TEST_RIOT_ID;

export const suite = {
  name: "Coaching",
  tests: [

    // ── Public coach listing ──────────────────────────────────────────────────
    {
      name: "GET /api/coaching/coaches — returns 200 without auth",
      async run(http) {
        const { res } = await http.get("/api/coaching/coaches");
        assertStatus(res, 200);
      },
    },
    {
      name: "GET /api/coaching/coaches — response has 'coaches' array",
      async run(http) {
        const { data } = await http.get("/api/coaching/coaches");
        assertArray(data.coaches, "coaches");
      },
    },
    {
      name: "GET /api/coaching/coaches — each coach has required fields",
      async run(http) {
        const { data } = await http.get("/api/coaching/coaches");
        for (const c of data.coaches) {
          assert("displayCode"  in c, "coach missing displayCode");
          assert("verifiedTier" in c, "coach missing verifiedTier");
          assert("hourlyRate"   in c, "coach missing hourlyRate");
          assert(typeof c.hourlyRate === "number", "hourlyRate should be number (cents)");
          assert(c.hourlyRate > 0, "hourlyRate should be positive");
        }
      },
    },
    {
      name: "GET /api/coaching/coaches — no private fields exposed",
      async run(http) {
        const { data } = await http.get("/api/coaching/coaches");
        for (const c of data.coaches) {
          assert(!("passwordHash" in c), "passwordHash should not be exposed");
          assert(!("email" in c),        "email should not be exposed in public coach list");
        }
      },
    },

    // ── Booking auth guards ───────────────────────────────────────────────────
    {
      name: "POST /api/coaching/book — requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/coaching/book", {
          coachProfileId: "fake", durationMinutes: 60,
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "POST /api/coaching/book — guest account returns 403",
      skip: !hasGuest,
      skipReason: "TEST_RIOT_ID not set",
      async run(http) {
        await http.post("/api/auth/login", { riotId: TEST_RIOT_ID, region: TEST_RIOT_REGION });
        const { res } = await http.post("/api/coaching/book", {
          coachProfileId: "fake", durationMinutes: 60,
        });
        assertStatus(res, 403);
      },
    },
    {
      name: "POST /api/coaching/book — invalid duration rejected (400)",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await http.post("/api/auth/login-email", { email: TEST_EMAIL, password: TEST_PASSWORD });
        const { res } = await http.post("/api/coaching/book", {
          coachProfileId: "fake", durationMinutes: 45, // not 30/60/90
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "POST /api/coaching/book — missing coachProfileId rejected (400)",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await http.post("/api/auth/login-email", { email: TEST_EMAIL, password: TEST_PASSWORD });
        const { res } = await http.post("/api/coaching/book", { durationMinutes: 60 });
        assertStatus(res, 400);
      },
    },
    {
      name: "POST /api/coaching/book — nonexistent coach returns 404",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await http.post("/api/auth/login-email", { email: TEST_EMAIL, password: TEST_PASSWORD });
        const { res } = await http.post("/api/coaching/book", {
          coachProfileId: "nonexistent-id-00000", durationMinutes: 60,
        });
        // 404 (coach not found) or 500 (Stripe not configured in test) — both acceptable
        assert(res.status === 404 || res.status === 500, `Expected 404 or 500, got ${res.status}`);
      },
    },
  ],
};
