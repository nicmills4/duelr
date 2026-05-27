/**
 * Suite 02 — Admin Panel
 *
 * Covers:
 *   - Auth (login / logout / wrong password)
 *   - Coach CRUD (list, create with new fields, update, delete)
 *   - User management (list, search, account-type toggle)
 *
 * Requires: ADMIN_PASSWORD env var
 */

import { assertStatus, assertOk, assertArray, assertHasKeys, assert, skip } from "../helpers/assert.mjs";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/** Login helper — keeps cookie state on the given HttpClient. */
async function adminLogin(http) {
  const { res } = await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
  assertStatus(res, 200, "admin login");
}

export const suite = {
  name: "Admin Panel",
  tests: [

    // ── Auth ──────────────────────────────────────────────────────────────────
    {
      name: "Admin login — rejects wrong password (401)",
      async run(http) {
        const { res } = await http.post("/api/admin/auth", { password: "definitely-wrong-xyz" });
        assertStatus(res, 401);
      },
    },
    {
      name: "Admin login — rejects empty body (401)",
      async run(http) {
        const { res } = await http.post("/api/admin/auth", {});
        assertStatus(res, 401);
      },
    },
    {
      name: "Admin login — succeeds with correct ADMIN_PASSWORD",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        const { res, data } = await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        assertStatus(res, 200);
        assertOk(data, "admin login");
        assert(http.hasCookie("duelr_admin"), "admin cookie should be set");
      },
    },
    {
      name: "Admin logout — clears session; subsequent request returns 401",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res: authed } = await http.get("/api/admin/coaches");
        assertStatus(authed, 200, "should be authed before logout");
        await http.delete("/api/admin/auth");
        const { res: after } = await http.get("/api/admin/coaches");
        assertStatus(after, 401, "should be rejected after logout");
      },
    },

    // ── Coach listing ─────────────────────────────────────────────────────────
    {
      name: "Admin coaches — GET returns coaches array after login",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res, data } = await http.get("/api/admin/coaches");
        assertStatus(res, 200);
        assertArray(data.coaches, "coaches");
      },
    },
    {
      name: "Admin coaches — each coach includes discordHandle and contactEmail fields",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { data } = await http.get("/api/admin/coaches");
        for (const c of data.coaches) {
          assert("discordHandle" in c,
            `Coach ${c.id} missing discordHandle field (may be null but must be present)`);
          assert("contactEmail" in c,
            `Coach ${c.id} missing contactEmail field (may be null but must be present)`);
        }
      },
    },
    {
      name: "Admin coaches — each coach includes roles field",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { data } = await http.get("/api/admin/coaches");
        for (const c of data.coaches) {
          assert("roles" in c, `Coach ${c.id} missing roles field`);
          // roles is a JSON string in admin responses
          assert(typeof c.roles === "string", "roles should be a JSON string in admin payload");
          const parsed = JSON.parse(c.roles);
          assert(Array.isArray(parsed), "roles should parse to an array");
        }
      },
    },

    // ── Coach create (POST) ───────────────────────────────────────────────────
    {
      name: "Admin add coach — rejects invalid Riot ID format (400)",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res } = await http.post("/api/admin/coaches", {
          riotId: "NOTVALID",   // missing #TAG
          region: "na1",
          verifiedTier: "MASTER",
          hourlyRateDollars: "30",
        });
        assertStatus(res, 400);
      },
    },
    {
      name: "Admin add coach — rejects missing required fields (400)",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res } = await http.post("/api/admin/coaches", { region: "na1" });
        assertStatus(res, 400);
      },
    },
    {
      name: "Admin add coach — creates coach with discordHandle and contactEmail",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);

        const riotId = `TestCoach${Date.now()}#TST`;
        const { res, data } = await http.post("/api/admin/coaches", {
          riotId,
          region:            "na1",
          verifiedTier:      "MASTER",
          hourlyRateDollars: "25",
          roles:             ["Mid", "Top"],
          champions:         ["Zed", "Yasuo"],
          discordHandle:     "testcoach#1234",
          contactEmail:      "testcoach@example.com",
          isApproved:        false,
        });
        assertStatus(res, 200);
        assertOk(data, "create coach");
        assert(data.profile.discordHandle === "testcoach#1234",
          "discordHandle should be persisted on the profile");
        assert(data.profile.contactEmail === "testcoach@example.com",
          "contactEmail should be persisted on the profile");

        // Cleanup — delete the test coach
        const coachId = data.profile.id;
        await http.delete(`/api/admin/coaches/${coachId}`);
      },
    },
    {
      name: "Admin add coach — discordHandle and contactEmail default to null when omitted",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);

        const riotId = `TestCoachNull${Date.now()}#TST`;
        const { res, data } = await http.post("/api/admin/coaches", {
          riotId,
          region:            "na1",
          verifiedTier:      "MASTER",
          hourlyRateDollars: "25",
          isApproved:        false,
        });
        assertStatus(res, 200);
        assertOk(data, "create coach no-discord");
        assert(data.profile.discordHandle === null,
          "discordHandle should be null when not provided");
        assert(data.profile.contactEmail === null,
          "contactEmail should be null when not provided");

        await http.delete(`/api/admin/coaches/${data.profile.id}`);
      },
    },

    // ── Coach update (PATCH) ──────────────────────────────────────────────────
    {
      name: "Admin update coach — returns 404 for nonexistent ID",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res } = await http.patch("/api/admin/coaches/nonexistent-id-99999", {
          isApproved: true,
        });
        assertStatus(res, 404);
      },
    },
    {
      name: "Admin update coach — can update discordHandle and contactEmail via PATCH",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);

        // Create
        const riotId = `TestPatch${Date.now()}#TST`;
        const { data: created } = await http.post("/api/admin/coaches", {
          riotId,
          region: "na1", verifiedTier: "MASTER", hourlyRateDollars: "20",
          isApproved: false,
        });
        const coachId = created.profile.id;

        // Patch
        const { res, data } = await http.patch(`/api/admin/coaches/${coachId}`, {
          discordHandle: "updated#9999",
          contactEmail:  "updated@example.com",
        });
        assertStatus(res, 200);
        assertOk(data, "patch coach");
        assert(data.profile.discordHandle === "updated#9999",
          "discordHandle should be updated");
        assert(data.profile.contactEmail === "updated@example.com",
          "contactEmail should be updated");

        // Cleanup
        await http.delete(`/api/admin/coaches/${coachId}`);
      },
    },
    {
      name: "Admin update coach — can clear discordHandle by setting to empty string",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);

        const riotId = `TestClear${Date.now()}#TST`;
        const { data: created } = await http.post("/api/admin/coaches", {
          riotId,
          region: "na1", verifiedTier: "MASTER", hourlyRateDollars: "20",
          discordHandle: "before#0000",
          isApproved: false,
        });
        const coachId = created.profile.id;

        // Clear by sending empty string — should store null
        const { res, data } = await http.patch(`/api/admin/coaches/${coachId}`, {
          discordHandle: "",
        });
        assertStatus(res, 200);
        assert(data.profile.discordHandle === null,
          "empty string discordHandle should be stored as null");

        await http.delete(`/api/admin/coaches/${coachId}`);
      },
    },
    {
      name: "Admin update coach — PATCH with no recognised fields returns 400",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res } = await http.patch("/api/admin/coaches/any-id", {
          unknownField: "value",
        });
        assertStatus(res, 400);
      },
    },

    // ── User management ───────────────────────────────────────────────────────
    {
      name: "Admin users — GET returns list",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res, data } = await http.get("/api/admin/users");
        assertStatus(res, 200);
        assertArray(data.users, "users");
      },
    },
    {
      name: "Admin users — search returns filtered results",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { res, data } = await http.get("/api/admin/users?q=nonexistentuser99999");
        assertStatus(res, 200);
        assertArray(data.users, "users");
        assert(data.users.length === 0, "Search for nonexistent user should return empty array");
      },
    },
    {
      name: "Admin users — each user has expected fields",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await adminLogin(http);
        const { data } = await http.get("/api/admin/users");
        for (const u of data.users) {
          assertHasKeys(u, ["id", "riotId", "region", "accountType", "createdAt"], "user");
        }
      },
    },
  ],
};
