# Dashboard mock and `pnpm dev:mock` — design

Status: approved in conversation on 2026-10-28, section by section.

## Goal

A developer with this repository and Node 24 can run one command, open the dashboard, and see the home page without a CasaOS box, without starting the stub by hand, and without pasting an `access_token` into DevTools.

That command is `pnpm dev:mock`.

The three steps the maintainer currently runs become that command:

1. start `mock/stats-stub/server.mjs`
2. start the Vue dev server with `VUE_APP_DEV_IP` / `VUE_APP_DEV_PORT` aimed at the stub
3. set `localStorage.access_token` in the browser

Node is pinned so a current Node (26, as of this writing) does not fail `vitest` at import time on `localStorage`.

## Decisions

- Approach A: a small orchestrator (`mock/dev.mjs`), no new npm dependency, the existing stub process, a committed `.env.mock`, a mock-only session seed in the dashboard.
- Pin Node to **24**, which is what CI already uses (`.github/workflows/ci.yml` and `release.yml`). Allow `>=20 <26` in `engines`.
- Do not make the stub check `Authorization`. It does not today.
- Do not stub the message-bus WebSocket in this work. Widgets that wait on socket.io events may stay empty; the home page still draws from HTTP (`/v1/sys/utilization`, `/v2/app_management/web/appgrid`, and the rest `handleGrid` already answers).
- `pnpm dev` against a real box is unchanged.

## Architecture

```
pnpm dev:mock
        │
        ▼
 mock/dev.mjs
   ├─ node mock/stats-stub/server.mjs --port 8099
   └─ vue-cli-service serve --mode mock     (port 8080)
              │
              │  proxy /v1 and /v2  (vue.config.js, unmodified)
              ▼
         127.0.0.1:8099   stats-stub
```

Axios already uses relative `/v1` and `/v2` URLs. The webpack-dev-server proxy in `vue.config.js` forwards them using `process.env.VUE_APP_DEV_IP` and `VUE_APP_DEV_PORT`. `--mode mock` loads `.env.mock`, so those values become `127.0.0.1` and `8099`.

Socket.io talks to `/v2/message_bus/socket.io/` on the same origin. Without `--upstream`, the stub destroys WebSocket upgrades. That is existing stub behaviour and stays.

## Node pin

| File | Contents |
|---|---|
| `.nvmrc` | `24` |
| `.node-version` | `24` |
| `package.json` `engines` | `{ "node": ">=20 <26" }` |

`packageManager` stays `pnpm@9.0.6`. Do not add `engine-strict` or an `.npmrc` that turns the range into a hard failure; a warning on the wrong Node is enough.

README Development currently says "Node 20 and pnpm 9.0.6 — what CI uses". Change that to Node 24. CI files already say `node-version: 24`; they are not edited.

### `localStorage` at import time

`src/plugins/i18n.js` reads `localStorage.getItem('lang')` while the module evaluates. Vitest's default environment is Node, not happy-dom. Under Node 26 that throws (`localStorage is undefined`) and the suite fails before any test runs. Node 22/24 happen to survive it in the maintainer's environment; the read is still wrong.

Guard it the same way `src/mixins/app/appLaunchPreference.js` already does:

```js
locale: (typeof localStorage !== 'undefined' && localStorage.getItem('lang')) || 'en_us',
```

`src/store/state.js` has the same class of read:

```js
networkStorage: JSON.parse(localStorage.getItem('networkStorage')) || [],
```

When `localStorage` is missing this throws before `|| []`. Guard the whole expression; if `getItem` returns `null`, `JSON.parse(null)` is `null` and `|| []` still yields `[]`.

This guard is not "support Node 26". `engines` still excludes 26. It is the crash the pin is documented against, and it is a correct import-time check on any Node.

## Orchestrator

New file `mock/dev.mjs`. No new dependency. The stub is already written as "no dependency".

### Behaviour

1. Spawn `node mock/stats-stub/server.mjs --port 8099` with `stdio: 'inherit'`, `cwd` the repository root.
2. Poll `GET http://127.0.0.1:8099/v1/users/status` until it answers HTTP 200, or fail after 5 seconds. A bind failure on 8099 (port in use, leftover stub) is this timeout plus whatever the stub printed; the orchestrator message is `stats stub did not answer on 127.0.0.1:8099`. Exit 1. Do not start Vue.
3. Spawn `pnpm exec vue-cli-service serve --mode mock` with `stdio: 'inherit'`, same cwd.
4. On SIGINT or SIGTERM, kill both children and exit 0. Neither child is left listening.
5. If Vue exits, kill the stub and exit with Vue's code. If the stub exits while Vue is still running, kill Vue and exit 1.

Do not daemonize. Do not open the browser itself; `vue.config.js` already has `devServer.open: true`.

`package.json` scripts:

```json
"dev:mock": "node mock/dev.mjs"
```

`pnpm dev` stays `vue-cli-service serve --mode dev`.

### `.env.mock`

Committed, next to `.env.dev` and `.env.production`. `.gitignore` already ignores `.env.*.local`, so a personal override is `.env.mock.local` and is not committed.

```
NODE_ENV=dev
VUE_APP_MOCK=1
VUE_APP_DEV_IP=127.0.0.1
VUE_APP_DEV_PORT=8099
```

`NODE_ENV=dev` is required: `src/main.js` sets `$baseIp` / `$baseURL` from `VUE_APP_DEV_*` only when `process.env.NODE_ENV === 'dev'`. Vue CLI `serve --mode mock` would otherwise set `NODE_ENV=development` and those globals would be `window.location`, which is 8080, not the stub.

`.env.dev` is not edited. Its `VUE_APP_DEV_IP=10.0.0.97` remains the sample for a real box.

## Session

The router (`src/router/index.js`) sends any `meta.requireAuth` route to `/login` when `localStorage.access_token` is missing. The stub already answers `GET /v1/users/status` as `{ initialized: true }`, so `/welcome` is skipped. Login is the remaining gate.

### Seed

New file `mock/session.js`, exported `seedMockSession(storage = localStorage)`.

If `storage.getItem('access_token')` is already a non-empty string, return without writing. Otherwise write:

| Key | Value |
|---|---|
| `access_token` | `mock-access` |
| `refresh_token` | `mock-refresh` |
| `expires_at` | `2000000000` (unix seconds, year 2033) |
| `user` | `{"id":1,"username":"casaos","nickname":"casaos","role":"admin","avatar":"","description":""}` |

These are not JWTs. The stub does not verify them. They only have to be present so the router and the axios interceptor (`src/service/service.js`) treat the browser as signed in.

`src/main.js` calls it after the imports and before `app.mount('#app')`, gated on the compile-time flag:

```js
if (process.env.VUE_APP_MOCK === '1') {
	seedMockSession()
}
```

Vue CLI inlines `VUE_APP_*`. A production build (`--mode production`) does not load `.env.mock`, so the flag is not `'1'` and the seed does not run. The function may still appear in the production bundle; it is a few assignments. Do not add a webpack alias or a dynamic import to hide it.

Do not commit Vuex in the seeder. The store starts with empty tokens today even when `localStorage` already has them (that is how a hand-set token works). The request interceptor copies `access_token` / `refresh_token` into the store on the first API call, and `connectBus` then opens the socket. With no message-bus WebSocket on the stub, that open fails the same way it does today.

### Login and refresh on the stub

`handleGrid` currently returns `null` for every non-GET except custom-storage POST and the image upload. Logout clears the tokens and lands on `/login`. Without a login route the developer would be stuck, which is worse than the three manual steps.

Add two POST handlers in `mock/stats-stub/grid.js`. They ignore the body. Any username and password succeed. There is no 2FA path (`success` is never `10014`).

`POST /v1/users/login` — the shape `Login.vue` `finishLogin` reads (`data.token.*` and `data.user`):

```json
{
  "success": 200,
  "message": "ok",
  "data": {
    "token": {
      "access_token": "mock-access",
      "refresh_token": "mock-refresh",
      "expires_at": 2000000000
    },
    "user": {
      "id": 1,
      "username": "casaos",
      "nickname": "casaos",
      "role": "admin",
      "avatar": "",
      "description": ""
    }
  }
}
```

`POST /v1/users/refresh` — the shape the axios interceptor reads (`data.data.access_token`, not nested under `token`). The interceptor calls `instance.post('/v1/users/refresh', …)` directly, so the path is `/v1/users/refresh` and does not go through `testVisionNum`:

```json
{
  "success": 200,
  "message": "ok",
  "data": {
    "access_token": "mock-access",
    "refresh_token": "mock-refresh",
    "expires_at": 2000000000
  }
}
```

`GET /v1/users/current` already returns that user. Leave it. The login page's avatar request (`/v1/users/image?path=…`) is unanswered and 404s; the template already has `src-fallback`. Do not add an image route.

The existing `handleGrid` rule "GET-only except custom POST and upload" becomes "those, plus login and refresh". Every other non-GET still returns `null`.

## Tests

No test for `mock/dev.mjs`. It is a process supervisor; a unit test would fake `spawn` and teach nothing the 5-second poll does not.

| File | What it asserts |
|---|---|
| `mock/stats-stub/grid.spec.js` | `POST /v1/users/login` returns 200 and `body.data.token.access_token` plus `body.data.user.username === 'casaos'`. `POST /v1/users/refresh` returns 200 and `body.data.access_token` (no `token` nest). A GET that was already covered still is. An unrelated POST still returns `null`. |
| `mock/session.spec.js` | `@vitest-environment node`. A `Map`-like fake storage: empty → the four keys are written; already has `access_token` → untouched. |
| `src/plugins/i18n.spec.js` | `@vitest-environment node`. Mock `@/assets/lang` as `{ default: { en_us: {} } }` (webpack's `require.context` is not the thing under test). Importing `@/plugins/i18n` does not throw when `globalThis.localStorage` is missing. `locale` is `en_us`. |

`src/store/state.js` is pulled in by many happy-dom tests that already have `localStorage`. A dedicated node-environment import of the store is not required if the i18n spec and the guard in `state.js` are in place; do not add one unless the suite still crashes on import.

Keep using vitest. Do not add MSW.

## Documentation

`README.md` Development:

- Requirement is Node 24 and pnpm 9.0.6 (CI). `engines` allows 20 and 22; 26 is outside the range because vitest was observed to fail there before the `localStorage` guard, and Vue CLI on 26 is untested.
- Real box: unchanged (`cp .env.dev .env.dev.local`, set `VUE_APP_DEV_IP`, `pnpm dev`).
- Without a box: `pnpm dev:mock`, then the URL webpack prints (8080). The dashboard opens signed in as `casaos`.
- One sentence: the stub answers the home page, the app grid, the VM tiles, stats, login and refresh. It does not run Docker, serve files, share disks, or speak the message-bus WebSocket.

Do not put a test count in the README; the current "37 tests" is already stale.

## Files

| Path | Action |
|---|---|
| `mock/dev.mjs` | create — orchestrator |
| `mock/session.js` | create — `seedMockSession` |
| `mock/session.spec.js` | create |
| `.env.mock` | create |
| `.nvmrc` | create |
| `.node-version` | create |
| `package.json` | add `dev:mock`, add `engines` |
| `src/main.js` | call `seedMockSession` when `VUE_APP_MOCK === '1'` |
| `src/plugins/i18n.js` | guard `localStorage` |
| `src/plugins/i18n.spec.js` | create |
| `src/store/state.js` | guard `localStorage` |
| `mock/stats-stub/grid.js` | POST login and refresh |
| `mock/stats-stub/grid.spec.js` | those two routes |
| `README.md` | Development section |
| `vue.config.js` | unchanged |
| `.env.dev` | unchanged |
| CI workflows | unchanged |

## Out of scope

- Message-bus WebSocket (or a socket.io stub)
- File manager, storage, Samba, App Store catalogue, compose editor, backups
- Running the Go services, Docker, mergerfs, or a compose stack
- `concurrently`, webpack-dev-server middleware, or folding the stub into `vue.config.js`
- Declaring Node 26 supported
- Changing how `pnpm dev` finds a real box
- Seeding Vuex from `mock/session.js`
- OAuth / cloud-drive stubs

## Verification (after implementation)

On Node 24:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run
pnpm lint
pnpm dev:mock
```

`pnpm exec vitest run` includes the new specs and does not fail on `i18n.js`.

`pnpm dev:mock` prints the stub listen line, then webpack's "App running at" on 8080. Opening that URL shows the dashboard (app grid: Jellyfin, Nextcloud, Immich, Plex), not `/#/login` and not `/#/welcome`. DevTools Application → Local Storage has `access_token` = `mock-access`. Ctrl-C returns the shell and leaves nothing listening on 8099 or 8080.

A second terminal with `pnpm dev:mock` while the first is still up exits 1 with the "did not answer" message (port busy), and does not take over 8080.

`pnpm dev` with an existing `.env.dev.local` still proxies to that box, not to 8099.
