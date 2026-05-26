/**
 * Suite 02 — Admin Panel
 * Requires ADMIN_PASSWORD env var (same as your .env).
 */

import { assertStatus, assertOk, assertArray, assert } from "../helpers/assert.mjs";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const suite = {
  name: "Admin Panel",
  tests: [

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
      name: "Admin coaches — GET returns list after login",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        // Login first
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        const { res, data } = await http.get("/api/admin/coaches");
        assertStatus(res, 200);
        assertArray(data.coaches, "coaches");
      },
    },
    {
      name: "Admin users — GET returns list",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
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
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        const { res, data } = await http.get("/api/admin/users?q=nonexistentuser99999");
        assertStatus(res, 200);
        assertArray(data.users, "users");
        assert(data.users.length === 0, "Search for nonexistent user should return empty array");
      },
    },
    {
      name: "Admin add coach — rejects invalid Riot ID format (400)",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        const { res } = await http.post("/api/admin/coaches", {
          riotId: "NOTVALID",       // missing #TAG
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
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        const { res } = await http.post("/api/admin/coaches", { region: "na1" });
        assertStatus(res, 400);
      },
    },
    {
      name: "Admin update coach — returns 404 for nonexistent ID",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        const { res } = await http.patch("/api/admin/coaches/nonexistent-id-99999", {
          isApproved: true,
        });
        assertStatus(res, 404);
      },
    },
    {
      name: "Admin logout — clears session, subsequent request is 401",
      skip: !ADMIN_PASSWORD,
      skipReason: "ADMIN_PASSWORD not set in environment",
      async run(http) {
        await http.post("/api/admin/auth", { password: ADMIN_PASSWORD });
        // Verify authed
        const { res: authed } = await http.get("/api/admin/coaches");
        assertStatus(authed, 200);
        // Logout
        await http.delete("/api/admin/auth");
        // Should be rejected now
        const { res: after } = await http.get("/api/admin/coaches");
        assertStatus(after, 401);
      },
    },
  ],
};
