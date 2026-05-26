/**
 * Suite 01 — Input Validation & Auth Guards
 * Tests bad inputs and unauthenticated access.
 * No session or external API required.
 */

import { assertStatus } from "../helpers/assert.mjs";

export const suite = {
  name: "Input Validation & Auth Guards",
  tests: [

    // ── /api/auth/login (guest) ──────────────────────────────────────────────
    {
      name: "Guest login — rejects empty body",
      async run(http) {
        const { res } = await http.post("/api/auth/login", {});
        assertStatus(res, 400);
      },
    },
    {
      name: "Guest login — rejects bad Riot ID format (no #)",
      async run(http) {
        const { res } = await http.post("/api/auth/login", { riotId: "FakerKR1", region: "na1" });
        assertStatus(res, 400);
      },
    },
    {
      name: "Guest login — rejects missing region",
      async run(http) {
        const { res } = await http.post("/api/auth/login", { riotId: "Test#0000" });
        assertStatus(res, 400);
      },
    },

    // ── /api/auth/register ───────────────────────────────────────────────────
    {
      name: "Register — rejects missing email",
      async run(http) {
        const { res } = await http.post("/api/auth/register", {
          riotId: "Test#0000", region: "na1", password: "password123",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Register — rejects invalid email format",
      async run(http) {
        const { res } = await http.post("/api/auth/register", {
          riotId: "Test#0000", region: "na1", email: "notanemail", password: "password123",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Register — rejects password shorter than 8 characters",
      async run(http) {
        const { res } = await http.post("/api/auth/register", {
          riotId: "Test#0000", region: "na1", email: "test@test.com", password: "short",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Register — rejects missing Riot ID",
      async run(http) {
        const { res } = await http.post("/api/auth/register", {
          region: "na1", email: "test@test.com", password: "password123",
        });
        assertStatus(res, 400);
      },
    },

    // ── /api/auth/login-email ────────────────────────────────────────────────
    {
      name: "Email login — rejects missing password",
      async run(http) {
        const { res } = await http.post("/api/auth/login-email", { email: "test@test.com" });
        assertStatus(res, 400);
      },
    },
    {
      name: "Email login — rejects missing email",
      async run(http) {
        const { res } = await http.post("/api/auth/login-email", { password: "password123" });
        assertStatus(res, 400);
      },
    },
    {
      name: "Email login — rejects unknown credentials (401)",
      async run(http) {
        const { res } = await http.post("/api/auth/login-email", {
          email: "nobody@nowhere.invalid", password: "wrongpassword",
        });
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Lobby ──────────────────────────────────────────────────
    {
      name: "Lobby available — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/lobby/available", {
          champId: "Zed", champName: "Zed", champImage: "x", eloBracket: "mid",
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Lobby challenge — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/lobby/challenge", {
          targetId: "someid", champId: "Zed", champName: "Zed", champImage: "x",
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Lobby respond — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/lobby/respond", {
          challengeId: "fakeid", accept: true,
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Lobby leave — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/lobby/leave", {});
        assertStatus(res, 401);
      },
    },
    {
      name: "Lobby group join — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/lobby/group/join", {
          groupId: "x", slotKey: "team1_adc", champId: "Zed", champName: "Zed", champImage: "x",
        });
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Queue ──────────────────────────────────────────────────
    {
      name: "Queue join — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/queue/join", {
          myChampion: "Zed", vsChampions: ["Darius"], eloBracket: "mid",
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Queue leave — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/queue/leave", {});
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Partners ───────────────────────────────────────────────
    {
      name: "Partners POST — requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/partners", {
          myChampions: ["Zed"], vsChampions: [], eloBracket: "mid", availability: [],
        });
        assertStatus(res, 401);
      },
    },
    {
      name: "Partners DELETE — requires auth (401)",
      async run(http) {
        const { res } = await http.delete("/api/partners");
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Coaching ───────────────────────────────────────────────
    {
      name: "Coaching book — POST requires auth (401)",
      async run(http) {
        const { res } = await http.post("/api/coaching/book", {
          coachProfileId: "fakeid", durationMinutes: 60,
        });
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Settings ───────────────────────────────────────────────
    {
      name: "Settings — PATCH requires auth (401)",
      async run(http) {
        const { res } = await http.patch("/api/settings", { action: "email", email: "x@x.com" });
        assertStatus(res, 401);
      },
    },

    // ── Auth guards — Admin ──────────────────────────────────────────────────
    {
      name: "Admin coaches — GET requires admin session (401)",
      async run(http) {
        const { res } = await http.get("/api/admin/coaches");
        assertStatus(res, 401);
      },
    },
    {
      name: "Admin users — GET requires admin session (401)",
      async run(http) {
        const { res } = await http.get("/api/admin/users");
        assertStatus(res, 401);
      },
    },
  ],
};
