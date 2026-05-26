/**
 * Suite 07 — Account Settings
 * Needs a session. Full account needed for email/password tests.
 */

import { assertStatus, assertOk, assert } from "../helpers/assert.mjs";

const TEST_RIOT_ID     = process.env.TEST_RIOT_ID;
const TEST_RIOT_REGION = process.env.TEST_RIOT_REGION ?? "na1";
const TEST_EMAIL       = process.env.TEST_EMAIL;
const TEST_PASSWORD    = process.env.TEST_PASSWORD;
const hasGuest         = !!TEST_RIOT_ID;
const hasFull          = !!(TEST_EMAIL && TEST_PASSWORD);

async function loginGuest(http) {
  const { res } = await http.post("/api/auth/login", {
    riotId: TEST_RIOT_ID, region: TEST_RIOT_REGION,
  });
  assertStatus(res, 200, "guest login");
}

async function loginFull(http) {
  const { res } = await http.post("/api/auth/login-email", {
    email: TEST_EMAIL, password: TEST_PASSWORD,
  });
  assertStatus(res, 200, "full account login");
}

export const suite = {
  name: "Account Settings",
  tests: [

    // ── No-auth guards (already covered in validation suite, but quick re-check) ──
    {
      name: "PATCH /api/settings — 401 without any session",
      async run(http) {
        const { res } = await http.patch("/api/settings", { action: "riotId", riotId: "X#0000", region: "na1" });
        assertStatus(res, 401);
      },
    },

    // ── Riot ID validation (needs any session) ────────────────────────────────
    {
      name: "Settings riotId — rejects bad Riot ID format",
      skip: !hasGuest && !hasFull,
      skipReason: "No test session available",
      async run(http) {
        hasFull ? await loginFull(http) : await loginGuest(http);
        const { res } = await http.patch("/api/settings", {
          action: "riotId", riotId: "NOHASHTAG", region: "na1",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Settings riotId — rejects missing region",
      skip: !hasGuest && !hasFull,
      skipReason: "No test session available",
      async run(http) {
        hasFull ? await loginFull(http) : await loginGuest(http);
        const { res } = await http.patch("/api/settings", {
          action: "riotId", riotId: "Test#0000",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Settings riotId — rejects Riot account not found (Riot API 404)",
      skip: !hasGuest && !hasFull,
      skipReason: "No test session available",
      async run(http) {
        hasFull ? await loginFull(http) : await loginGuest(http);
        const { res } = await http.patch("/api/settings", {
          action: "riotId", riotId: "ZZZNobodyXXX#9ZZ9", region: "na1",
        });
        // Either 404 (Riot API not found) or 400 (format), depending on Riot API
        assert(res.status === 404 || res.status === 400, `Expected 400/404, got ${res.status}`);
      },
    },

    // ── Email settings (full account only) ───────────────────────────────────
    {
      name: "Settings email — guest account returns 403",
      skip: !hasGuest,
      skipReason: "TEST_RIOT_ID not set",
      async run(http) {
        await loginGuest(http);
        const { res } = await http.patch("/api/settings", {
          action: "email", email: "new@example.com",
        });
        assertStatus(res, 403);
      },
    },
    {
      name: "Settings email — rejects invalid email format",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await loginFull(http);
        const { res } = await http.patch("/api/settings", {
          action: "email", email: "notanemail",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Settings email — update to same email succeeds (idempotent)",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await loginFull(http);
        const { res, data } = await http.patch("/api/settings", {
          action: "email", email: TEST_EMAIL,
        });
        assertStatus(res, 200);
        assertOk(data, "update email");
      },
    },

    // ── Password settings (full account only) ─────────────────────────────────
    {
      name: "Settings password — guest account returns 403",
      skip: !hasGuest,
      skipReason: "TEST_RIOT_ID not set",
      async run(http) {
        await loginGuest(http);
        const { res } = await http.patch("/api/settings", {
          action: "password", currentPassword: "any", newPassword: "newpassword123",
        });
        assertStatus(res, 403);
      },
    },
    {
      name: "Settings password — rejects wrong current password (401)",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await loginFull(http);
        const { res } = await http.patch("/api/settings", {
          action: "password",
          currentPassword: "this-is-definitely-the-wrong-password-xyz",
          newPassword:     "newpassword123",
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Settings password — rejects new password under 8 chars",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await loginFull(http);
        const { res } = await http.patch("/api/settings", {
          action: "password", currentPassword: TEST_PASSWORD, newPassword: "short",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Settings password — rejects unknown action",
      skip: !hasFull,
      skipReason: "TEST_EMAIL / TEST_PASSWORD not set",
      async run(http) {
        await loginFull(http);
        const { res } = await http.patch("/api/settings", { action: "unknown" });
        assertStatus(res, 400);
      },
    },
  ],
};
