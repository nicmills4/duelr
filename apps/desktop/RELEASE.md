# Duelr Desktop — Release, CI/CD & Auto-Update Plan

Status: **Phases 0, 2, 3 built** (config, CI workflow, auto-update wiring — all typecheck-clean).
**Phase 1 (Azure Trusted Signing) is the remaining gate**: the workflow + signing scaffold are in
place but inert until the Azure account is verified, `azureSignOptions` is uncommented in
`electron-builder.yml`, and the `AZURE_*` secrets are added. Do not cut a public `desktop-v*` release
until then (it would publish unsigned).

## Locked decisions
- **Update feed:** GitHub Releases on the **public `nicmills4/duelr`** monorepo. electron-updater
  reads it with no token; CI publishes with the built-in `GITHUB_TOKEN` (no PAT, no second repo).
- **OS scope:** Windows NSIS x64 only (mac/Linux dropped for now; League/LCU is Windows + macOS only).
- **Code signing:** from day one via **Azure Trusted Signing** (~$10/mo, cloud, no hardware token,
  CI-friendly, earns SmartScreen reputation). Requires electron-builder v25+.
- **Release tags:** namespaced **`desktop-v*`** (e.g. `desktop-v0.2.0`) so they coexist with the web
  app in the shared repo.

## Why this shape
- A token must never be shipped inside the desktop binary, so a private-repo GitHub feed is out.
  Keeping `duelr` public makes the feed tokenless and the simplest possible (built-in `GITHUB_TOKEN`).
- Signing also hardens updates: on Windows, electron-updater verifies the installer's publisher name.

---

## Phase 0 — Config hygiene  ✅ done
- Delete the dead `build` block from `apps/desktop/package.json` (the `.yml` is the single source of
  truth; the inline block was being ignored).
- `electron-builder.yml`: Windows NSIS x64 only; `publish` → `nicmills4/duelr`; scaffold (inert)
  `azureSignOptions` for Phase 1.
- Add deps: `electron-updater`, `electron-log`. Bump `electron-builder` to v26.
- Add `dev-app-update.yml` for local update testing against a real release.

## Phase 1 — Azure Trusted Signing  (gates the first signed release)

Identity type chosen: **Public** validation (publicly-distributed app → publicly-trusted root).

### Doable now — in parallel with the identity review
1. **Service principal (CI auth).** Entra ID → App registrations → New registration
   (e.g. `duelr-desktop-signing`). Record **Directory (tenant) ID** + **Application (client) ID**.
   Certificates & secrets → New client secret → copy the **secret value** (shown once).
2. **Grant signing rights.** Trusted Signing account → Access control (IAM) → Add role assignment →
   **Trusted Signing Certificate Profile Signer** → assign to the app registration from step 1.
   (Account scope is fine and works before the cert profile exists.)
3. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` from step 1.

### Blocked until the identity validation shows **Approved**
4. Trusted Signing account → Certificate profiles → New → type **Public Trust** → note its name.
5. Uncomment `win.azureSignOptions` in `electron-builder.yml` and fill:
   - `endpoint` — account region endpoint, e.g. `https://eus.codesigning.azure.net/`
   - `codeSigningAccountName` — the Trusted Signing account name
   - `certificateProfileName` — the Public Trust profile (step 4)
   - `publisherName` — the validated identity's common name (from the approved validation)
6. **Dry run:** Actions → Desktop Release → Run workflow (manual dispatch) → builds + signs, no publish.
7. **First release:** bump `apps/desktop/package.json` version → `git tag desktop-v0.2.0` → `git push --tags`.

## Phase 2 — CI/CD  ✅ done  (`.github/workflows/desktop-release.yml`)
- Trigger: push of a `desktop-v*` tag (+ `workflow_dispatch`).
- `windows-latest`: checkout → setup-node (npm cache) → `npm ci` →
  `npm run build --workspace=apps/desktop` → `electron-builder --win --publish always`.
- Env: `GITHUB_TOKEN` (auto) + the three `AZURE_*` secrets.
- Output on the Release: signed `Duelr-setup-<v>.exe` + `latest.yml` + `.blockmap` (delta updates).

## Phase 3 — Auto-update wiring  ✅ done
- Main (`src/main/index.ts`): `autoUpdater` from `electron-updater`; check on launch + every few
  hours; `autoInstallOnAppQuit = true` (never interrupt a game). Bridge `update-available` /
  `download-progress` / `update-downloaded` / `error` to the renderer; log via `electron-log`.
- Preload: expose `window.duelr.updates.onStatus(...)` + `quitAndInstall()`.
- Renderer: dismissible "Update ready · Restart" banner → `quitAndInstall()`. No forced restarts.

---

## Release runbook (once Phases 1–3 land)
1. Bump `apps/desktop/package.json` `version`.
2. Commit, then `git tag desktop-v<version>` and `git push --tags`.
3. CI builds, signs, and publishes the GitHub Release. Running clients auto-update.

This replaces the manual `npm run dist:win` flow.

## Secrets
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (Trusted Signing).
- `GITHUB_TOKEN` is automatic for same-repo publishing — no PAT needed.
