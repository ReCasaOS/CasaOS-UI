# CasaOS-UI

> **Not affiliated with IceWhale.** An independent, community-maintained distribution of CasaOS, not produced or endorsed by Shanghai IceWhale Technology Limited. CASAOS is their trademark, used here only to say what this is a release of. The original project is [IceWhaleTech/CasaOS](https://github.com/IceWhaleTech/CasaOS); report problems with this distribution at [ReCasaOS/CasaOS/issues](https://github.com/ReCasaOS/CasaOS/issues).

The CasaOS dashboard: the single-page application served at the root of a CasaOS box. It is the app grid, the App Store, the file browser, the storage and share screens, the settings and the sidebar widgets. This repository is the dashboard of **ReCasaOS**, a maintained release of the project after upstream [IceWhaleTech/CasaOS-UI](https://github.com/IceWhaleTech/CasaOS-UI) stopped shipping in 2025. It descends from that repository through [alvins82's fork](https://github.com/alvins82/CasaOS-UI), whose commits are in this history.

## What it does

A Vue 2.7 application with Buefy and Bulma, built by vue-cli-service. It has no server and no backend code of its own: everything it shows comes from the CasaOS services, reached on the same origin through [CasaOS-Gateway](https://github.com/ReCasaOS/CasaOS-Gateway).

Four routes, hash mode, in [`src/router/route.js`](src/router/route.js):

| Route | Screen |
|---|---|
| `/welcome` | first-run setup, while no account exists |
| `/login` | sign-in |
| `/` | the dashboard: wallpaper, sidebar widgets, app grid, top bar, file browser |
| `/launch` | the waiting screen while an app starts, before it opens |

It calls `/v1/...` on CasaOS core for accounts, Samba shares, system information and files, `/v2/...` on AppManagement, LocalStorage and UserService, and holds a socket.io connection to `/v2/message_bus/socket.io/` for live app and installation events.

Per-account preferences are stored on the box, not in the browser: the wallpaper, the app-grid order, the sidebar widgets, the top bar, the external links and the file-browser shortcuts all go through `/v1/users/current/custom/<key>`. An uploaded wallpaper is written to `/v1/users/current/image/<key>` and the account avatar to `/v1/users/avatar`. All of it follows the account, so it survives a new browser.

Only the access and refresh tokens, the language, the time and temperature formats, the hidden-file toggle and the app-launching preferences are browser-local (`localStorage`), and those do follow the browser. The wallpaper path is cached there too, but the copy the server holds is what a fresh browser reads back on load.

`pnpm build` writes a sysroot rather than a `dist` directory:

- `build/sysroot/var/lib/casaos/www/` — the built application. This is the directory the gateway serves; its `-w` flag defaults to it.
- `build/sysroot/var/lib/casaos/ui-message-bus.json` — the event types the dashboard publishes.
- `build/sysroot/etc/casaos/start.d/register-ui-events.sh` — run at boot, POSTs those event types to the message bus.

A release publishes that tree as `linux-all-casaos-<tag>.tar.gz`, which is what the installer extracts.

## Install

Components are not installed individually. One command installs the whole distribution, dashboard included:

```sh
curl -fsSL https://github.com/ReCasaOS/CasaOS-Install/releases/latest/download/install.sh | sudo bash
```

What a release contains, and how it is built, is described in [CasaOS-Install](https://github.com/ReCasaOS/CasaOS-Install#readme).

## What this fork changed

Since alvins82's v0.4.30. The full list per release is in [CHANGELOG.md](CHANGELOG.md).

- **Compose editor** — the `docker-compose.yml` of an installed app is editable from its settings panel: validated in the browser, then server-side with `dry_run=true`, then applied. It is also the only way to edit an app's labels.
- **App launching is a setting** — whether apps open inside CasaOS or in a new tab, with a per-app exception list. It used to be a constant with qBittorrent hard-coded into it; the default reproduces that exactly.
- **Authenticated shares** — a shared folder can require an account instead of being world-writable to guests, those accounts are created and managed from the dashboard, and an existing share converts between the two without being unshared and reshared.
- **Time Machine shares** — a share can be advertised to macOS as a backup disk ([CasaOS #1030](https://github.com/IceWhaleTech/CasaOS/issues/1030)).
- **App Store category guard** — the panel no longer renders nothing when every category comes back with a count of zero, which happens with only a third-party store registered ([CasaOS #2537](https://github.com/IceWhaleTech/CasaOS/issues/2537), idea from [CasaOS-UI #274](https://github.com/IceWhaleTech/CasaOS-UI/pull/274)).
- **No device fingerprint** — `BrandBar` fetched the news feed with an MD5 of the machine's MAC address, the version and the language base64-encoded into the query string, on every dashboard load. The feed is fetched without it and the device id stays on the box.
- **Tests that run** — `vitest` was declared in `package.json` in December 2024 and never installed, so the suite had never executed once. It is a dependency now.
- **CI and releases** — the old CI job was gated on `github.repository == IceWhaleTech/CasaOS-UI` and skipped silently on every fork; the old release workflow needed the `@icewhale` npm scope and IceWhale's object storage. Both are replaced by workflows that need nothing but the default token.

## Development

Node 20 and pnpm 9.0.6 — what CI uses and what `packageManager` declares.

```sh
pnpm install --frozen-lockfile
pnpm vitest run                 # 37 tests
pnpm build                      # writes build/sysroot/...
```

`pnpm test` starts vitest in watch mode; `pnpm vitest run` is the one-shot form CI runs.

To point a development server at a real CasaOS box, copy `.env.dev` to `.env.dev.local` (git-ignored), set `VUE_APP_DEV_IP` to its address, then:

```sh
pnpm dev
```

It serves on port 8080 and proxies `/v1` and `/v2` to that host.

## Licence and credit

The dashboard is the work of IceWhale and its contributors, and their copyright headers are kept throughout the source. alvins82's fork is in this repository's history and his changes are still in it.

This repository has never carried a LICENSE file — not upstream, not in any fork; `git log --all --diff-filter=A -- LICENSE` returns nothing. We have not added one, because we are not in a position to grant a licence its authors did not. CasaOS as a whole is published under the Apache License 2.0, and the built dashboard ships inside CasaOS releases under that licence, as upstream shipped it.

The changes made here by the ReCasaOS maintainer since the fork (the Vue 3 migration, the dark theme, the new components and the rest of that author's commits) are offered under the Apache License 2.0; see [NOTICE](NOTICE). That statement covers only those changes: it does not reach IceWhale's code or alvins82's, and it is not a licence for the repository as a whole.

CasaOS is a mark of IceWhale. This distribution uses the name to say what it is a release of, and nothing more.
