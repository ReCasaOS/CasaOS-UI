# Changelog

All notable changes to CasaOS UI are documented here.

## [0.4.57] - 2026-09-13

### Added

- **Restore.** Every finished backup in the History tab has a Restore button. The confirmation says what will happen before anything is touched: the app is stopped, its data is replaced by that backup, and files added since then are removed. A restore shows in the same list afterwards, tagged as one, with its outcome. Needs AppManagement v0.4.41.

## [0.4.56] - 2026-09-12

### Added

- **The panel shown after sharing a folder says who can open it.** The account chosen a moment earlier, or a warning that anyone on the network can read and write it. A file item from the browser carries no such information, and the line is left out rather than guessed.

### Fixed

- **A failed uninstall resets its button.** The handler compared a property no event carries, so the spinner stayed until the page was reloaded.
- **Every property the dashboard reads off an event is now checked against the names the services publish.** The message bus validates nothing, and a misspelt name here was not an error anywhere: it read as `undefined` and the handler quietly did the wrong thing, which is how the update handlers read `name` and `cid` for three years. A test walks every component and fails on a name nothing sends.

## [0.4.55] - 2026-09-12

### Fixed

- **Updating an app drew two cards, and the real one never went away.** The two update handlers read properties no event has ever carried, so the update opened a nameless card with an empty bar under the key `undefined` while the pull filled the real one; at the end the nameless one was removed and the app's own card sat at whatever percentage it had reached until the page was reloaded. Every app event names its app in `app:name`, as the other seven handlers in that file already read it.
- **A failed update says why.** `app:update-error` had no handler at all, so an update that died left its card on screen at the percentage it stopped on, silent.
- **The New badge after an update means the app was replaced.** It was keyed on a newer image having been pulled, which is also true of a pull that then fails to start.
- **An app the catalogue knows nothing about gets a progress card.** The title was parsed with a bare `JSON.parse`, and an app whose compose file has no `x-casaos` has no title, so the parse threw inside the socket handler and no card appeared at all. It falls back to the app's own name.
- **The progress line is translated.** "Installing 88%" was shown exactly as written, in English, under a title that had been translated.

## [0.4.54] - 2026-09-12

### Added

- **Every shared folder says who can open it.** The list showed an account only when a share had one, glued onto the folder's name, which left a guest share saying nothing at all -- and nothing is exactly what somebody scanning for an unprotected share cannot see. Each row now carries a tag of its own: the account, or **Everyone** in warning colours.
- **Share accounts have an entrance.** The only way to reach them was a link inside the dialog that assigns one to a folder, which is no use to somebody who has not made an account yet. **Shared folders** has a **Manage accounts** button. Completes [ReCasaOS/CasaOS#1](https://github.com/ReCasaOS/CasaOS/issues/1).

## [0.4.53] - 2026-09-12

### Fixed

- **Sharing a folder could only ever make it public.** Right-click a folder, Share, and the dashboard posted the share with `anonymous: true` and opened no dialog at all: the folder went onto the network readable and writable by anyone, with no opportunity to say otherwise. Ticking **Shared** in the New Folder dialog did the same. The account switch existed, but only on the third route -- the multi-folder picker reached from the sidebar -- so the two obvious paths were the ones that could not protect anything. Both now ask, with the same controls the picker has, and guest access says what it means instead of leaving it to be discovered. The default is still guest, now visible rather than implied. Reported as [ReCasaOS/CasaOS#1](https://github.com/ReCasaOS/CasaOS/issues/1).

## [0.4.52] - 2026-09-11

### Fixed

- **The app settings panel was opened with no class at all**, so every rule written for it applied to nothing -- including the width widened in 0.4.50 for the Containers tab, and the `.animation-content` cap without which Buefy holds any modal at its default 640px. Ten columns rendered into that width put one character per line under Image and Memory. The install flow passes the class, which is why that one has always been wide. A guard now reads the source and checks that every call site opening this panel passes a class the panel actually styles: the two halves live in different files, nothing links them, and no unit test computes a width.

## [0.4.51] - 2026-09-11

### Added

- **Three headings on the dashboard where there was one wrong instruction.** "Legacy app (To be rebuilt)" covered three populations that have nothing in common but being outside the compose list, and for two of them the instruction was wrong: a container Portainer or Dockge started is managed, just not from here, and rebuilding it invites a second copy of something already running; one somebody ran by hand is not an app and has nothing to rebuild. The three sections are read from `app_type`, `compose_project` and `is_uncontrolled`, all of which the backend already sent and none of which was being used.
- **Cards that carry what identifies them.** Docker hands out `adoring_antonelli`, and a container whose name it never set falls back to a 64-character id -- for those the name is not an identity and the image is. Image, published port and a rough age, only on the cards whose name says nothing; repeating the image under an app installed from the catalogue would be noise on every tile. The age is deliberately rough: nobody deciding whether to delete a stray container needs the minute, and a container created in the future is a clock that disagrees, not an age.
- **A panel that says what a container is, and removes it.** Image, state, age, command, restart policy, networks, published ports, host paths, named volumes with their size, and the environment -- hidden until asked for, because these routinely carry passwords and a panel somebody opens to find out what a container is should not put them on screen on the way past. Removal shows the volumes before anything is deleted, with their size, and shows the ones that cannot go saying why: a container comes back from its image, a volume does not. A volume the server then refuses is reported as kept rather than swallowed. A container belonging to a compose project gets the panel and nothing else -- its stack is removed by uninstalling the app.

### Fixed

- **Two panels had no width rule at all.** Both were opened with `customClass` `account-modal`, copied from the panels beside them, and that class has no rule anywhere in the tree -- so every modal using it fell back to Buefy's default, around 640px. The container panel holds host paths and environment variables, which wrapped a word per line; the backups panel holds a schedule row that folded into something unreadable. Each now has a class of its own and a real width.

## [0.4.50] - 2026-09-11

### Added

- **Start, stop and restart one container** of an app, from the Containers tab, instead of taking the whole stack down to fix one of its parts. Which two buttons a row offers comes from the state Docker reports; a service the compose file declares but Docker runs nothing for, and one being removed, are offered nothing on purpose.
- **CPU and memory per container**, re-sampled every five seconds while the tab is open and stopped the moment it closes. The CPU figure is percent of one CPU, as `docker stats` reports it, so a container using two whole cores reads over 100. A container the daemon could not sample shows nothing rather than zero.
- **Backups**: a Backups panel in the settings menu with destinations, schedules and history, and a **Back up** entry in each app's menu. A destination is an rclone remote, so credentials are kept where this box already keeps the ones for its cloud drives. Options are typed as rows rather than a fixed form, because rclone decides what each backend needs and gains options between releases; picking a backend fills in the names it usually wants. History shows failures beside successes, and whether the app was stopped for each run — the column that decides whether a backup of a database can be trusted to restore.

### Fixed

- **A named volume is a name, not a folder.** A volume in the long syntax rendered as `[object Object]` in the compose editor: every entry was run through a substitution against the file's top-level `volumes:` block, which maps a volume name to its definition rather than a variable to a value. A volume declared with nothing under it — the common way to write one — had its name replaced with an empty string and lost it without a word. The short syntax had the same defect from the other end, reading `backend-storage:/data` as a bind and inventing a host path for it. The host picker no longer appears on those rows either: it browses the host, so choosing a folder turned the volume into a bind on save and detached whatever was in it.
- **The settings modal has room for its widest tab.** It was pinned at 50rem whatever the screen, and the Containers tab has ten columns — on the reported box a port mapping came out one character wide. Part of that was this dashboard's own doing: the monospace class carries `word-break: break-all`, which an image reference needs and a port mapping does not.
- An app that publishes no web interface says where to set one — Settings › Web UI — rather than only that there is none.

## [0.4.49] - 2026-09-10

### Fixed

- **The dashboard says who publishes it.** The footer read "Made with ❤️ by IceWhale and YOU!" on every page of a distribution whose own README says it is not affiliated with IceWhale. It now names this distribution and credits the project it is built on, on a second line, which is the thing the old line was trying to say and got backwards. The console banner printed on every load said the same and says the same now.
- The "what's new" panel shown after an update linked to IceWhale's repository rather than to the one the update came from.
- The default icon for an external link whose site offers none was IceWhale's GitHub organisation avatar, fetched from GitHub at the moment of adding. It is the dashboard's own default app icon now, and nothing leaves the box to draw it.
- A disk at 80% offered **Free up storage** as a link to `wiki.casaos.io/zh/guides` — IceWhale's wiki, and its Chinese half, whatever language the reader had chosen. The hint stays; the link is gone, because this distribution has no wiki to send anyone to instead.
- **An app that publishes no web interface says so, rather than opening the dashboard inside itself.** A stack written by hand declares neither a port nor an index, and the card is told the app's own address only after the grid has already defaulted it to the box's. So the URL built from those three came out as `http://<the box>` — the dashboard, opened in the frame. It was unreachable until now only because such an app arrived with no status at all and every click fell into the "not running" branch instead, which sent `start` to a stack that was already up. Having nothing to open is an answer; the card gives it, and the app launcher no longer waits on a URL that will never answer.

## [0.4.48] - 2026-09-10

### Fixed

- **The upgrade dialog no longer deletes a session it cannot identify.** The unmount hook added in 0.4.47 stops the orphaned log poll, but only in the dashboard doing the reloading — and the dashboard doing the reloading is the old one, the version being replaced. So the upgrade that installed that fix still ran the bug, and cost one last double login. The reload now leaves the session alone entirely, which is safe whatever version drove the upgrade. Clearing was never load-bearing: the upgrade rotates the token keys, so those tokens are dead whether or not they are deleted, and the first request after the reload lands on the login page anyway. What clearing did change is the case nobody meant — firing late, after the owner had signed in again, and deleting a session that was alive.
- **The message naming apps a check could not verify is readable.** Four apps behind one unreachable registry produced four lines, each with the app's full image reference including its `@sha256:` pin — sixty-four characters of hex apiece — and the same cause repeated four times. Apps are grouped by cause now, up to three named with the rest counted, so that reads as one fact with four names on it. A reason the dashboard cannot split is shown whole rather than guessed at.

## [0.4.47] - 2026-09-10

### Fixed

- **A check now names the apps it could not verify, and says why.** "Apps that could not be checked: 3" is something to worry about and nothing to do. The backend has said which apps and for what reason all along — its answer carries a map of app name to reason — and the dashboard was reducing it to its length. Three are named with their reason, so one unreachable registry behind twenty apps does not fill the screen, and the message stays up long enough to read.
- The storage widget's **Free up** button shows that it is working. The prune is synchronous and answers with the bytes it actually freed, so nothing appeared until the daemon had finished walking the layers — seconds, on a box with a few dozen old versions, of a button that looked like it had done nothing.

## [0.4.46] - 2026-09-10

Four things a box reported in one sitting, all of them the same shape: a stack somebody wrote by hand is not a second-class app, and an update is not a reason to lose your seat.

### Fixed

- **An update no longer costs two logins.** The update dialog is opened outside the router view, so closing it unmounts the component — and its upgrade-log poll went on running anyway, because unlike the system-package dialog it had no `beforeUnmount`. The installer restarts the user service, which generates its signing key in memory at every start, so the browser's tokens stop verifying; the orphaned poll took a 401, the interceptor's refresh failed, and you were sent to the login page. You signed in, a session was created — and that same poll, now carrying a valid token, finally read `CasaOS upgrade successfully` and cleared the session it never knew about. The dashboard appeared and was taken away about two hundred milliseconds later. Landing on the login page after an update is correct, because the old tokens really are dead. Landing there twice was not.
- A failed token refresh no longer poisons the page. It left the refresh flag raised with the queue full, so every later 401 was parked behind a refresh that would never be attempted again and hung for as long as the page lived — which is why the poll above never reported its own error and never stopped itself.
- Signing in navigates as soon as the session is stored. It used to fetch the system version first, for a router-guard cache nothing else read: when that call failed the throw skipped the navigation and left you on the login page, signed in and unable to tell. The guard's other half went with it — it deleted the access token on arrival whenever that same cache was missing, so the only way to fill it was the login it sent you back to.
- **A stack written by hand opens with the name it already has.** App Name is required and is filled from the `x-casaos` section, which such a stack does not have, so the field was blank on every service tab: the settings could not be saved until a name was invented, and renaming started from an empty box rather than from the name on the card. The grid has always shown the compose project name for these apps; the editor now starts from the same one. A title the compose already carries is left alone.

## [0.4.45] - 2026-09-10

The release that stops treating an app as one container. A stack is what most people actually run — a VPN with services routed through it, a database with a migration sidecar — and the dashboard showed it as a single row with a single dot.

### Added

- **A Containers tab** in the app settings panel: one row per container of every service, with its state in plain words, Docker health, image, published host ports, uptime and, once it has stopped, its exit code. The endpoint already returned all of it and the panel read the container ID and threw the rest away. Health has four cases rather than three — an image that declares no `HEALTHCHECK` reports nothing while running, and a container that is not running reports nothing at all; neither is shown as unhealthy.
- **A line-count selector and a Download button** in the log viewer. It always asked for the backend's default of 1000 lines and offered no way out. 100, 1000 or the whole log, and the whole log turns the five-second polling off rather than repeating a multi-megabyte round trip — the toolbar says so instead of changing behaviour silently. Lines now carry the time the daemon wrote them.
- **A CPU Limit field** in the compose editor, writing `deploy.resources.limits.cpus`. CPU Shares is a relative weight: it changes nothing while the host has spare capacity, so it could not express "this transcoder gets at most two cores".
- **Pull and recreate** for a container CasaOS did not install. Such a container had no action at all — the card hid the whole dropdown. It is offered nowhere else: on a container of a compose app it would clone it out of its project and leave the project's own state behind.
- **An offer to free the disk old app versions hold**, in the Storage widget, where someone is already reading how full the disk is. It stays hidden until there is something to reclaim, names the count and the size before the button is pressed, and only ever touches images no app runs any more.

### Fixed

- The compose editor rejected every hand-assembled stack whose project name is nobody's service key: red bar, Apply greyed out, no way to edit the file at all. That was never a rule the backend had — it takes the main service from `x-casaos.main` and otherwise the alphabetically first one, and never looks at the project name.
- A failed App Store update opened a green "is the latest version!" toast. The update answers 200 at once and finishes in a goroutine, so the outcome only ever arrives over the message bus; the card read a missing property as "nothing to report" and congratulated itself either way. Failures now arrive on their own event and are reported as failures.
- The card claims only what the events prove. A recreate whose pull had failed was announced as "No newer image was pulled" — an unreachable registry arriving as proof that nothing newer exists — while a successful App Store update said nothing at all and left the grid stale.
- Every container of a stack is shown, not one per service. A service scaled to several replicas drew one row and hid the rest, which is exactly the multi-service stack the report was about. Replicas are told apart by their container name, put under the service name only when there is more than one.
- The Logs tab follows the row the panel was opened on. It called the app-wide endpoint, so one row of a multi-service stack showed the whole stack interleaved under one service's name and saved it under one service's filename.
- The terminal no longer opens on a container that is gone. A container removed between the tab drawing its row and someone clicking it opened a websocket on a dead ID: a blank terminal and no message.
- The pull-and-recreate entry is offered only where it is safe. The backend calls `container` anything without a CasaOS label that its compose list did not claim, and that list silently skips a project whose config file it cannot load — so a Portainer or Dockge stack reached the card with the button on it.
- A recreate is reported once, by the card that started it. The grid toasted it too, under the wrong name: the section only has the app name, which for an imported container is the image, so a recreate of a container called `nginx` announced `ubi9/nginx-120 has been updated`.
- A failed recreate is reported whichever of its two events lands first. The backend publishes the error from a goroutine and the end-of-update from a defer, so the order is a race, and the card dropped whichever arrived second — a recreate whose pull worked and whose clone then failed said nothing at all, and the spinner just stopped.
- A container owned by a compose project CasaOS cannot read no longer carries a dots button that opens onto an empty menu. Every entry there is for an app CasaOS installed, and the one exception, the recreate, is refused for exactly that container.

## [0.4.44] - 2026-09-09

### Added

- **Check for image updates**, in the apps menu. It asks each installed app's registry what its tag points at now, and the apps whose image has moved carry a badge beside their icon afterwards. Until now the only way to ask was to open one app's menu and press "Check then update", one app at a time.
- The badge is drawn from what that check found, never computed while the grid loads: the app grid is on the dashboard's first paint and must not wait on a registry. An app nobody has checked yet carries no badge, which is deliberately the same as an app known to be current — the difference between the two is a claim the dashboard cannot make, so it makes neither.

### Changed

- "Check then update" is offered for imported apps too. It was hidden for them because the backend had nothing to offer an app with no catalogue entry; for those the update is now a pull of the tags they already name.
- Apps that could not be checked are reported in their own, louder message rather than folded into the count of apps that are fine. An answer the dashboard cannot read is reported as exactly that, rather than as everything being current.

## [0.4.43] - 2026-09-07

The dashboard no longer takes an npm package from IceWhale, on trust or
otherwise: there is none left.

### Removed

- The `@icewhale/casaos-openapi` dependency, which had no import site
  anywhere in the tree.
- The `@icewhale/casaos-appmanagement-openapi` dependency - the last one.
  It is the App Store and compose surface of the dashboard (4 imported
  symbols, 16 operations, 41 call sites), and pinning it to `0.4.17-alpha1`
  only made the build reproducible: every CI run and every release still
  downloaded it from npm under IceWhale's account.

### Added

- `src/openapi/app_management`, the same client generated from our own
  AppManagement spec with the same generator (openapi-generator
  `typescript-axios`), committed rather than fetched. `pnpm run
  generate:app-management` regenerates it from
  `../CasaOS-AppManagement/api/app_management/openapi.yaml`, and
  `openapitools.json` pins the generator version so a regeneration is a
  reviewable diff and not a surprise. It is committed for the same reason
  the translations are: generating needs Java and a 20 MB jar download,
  which is not a thing to ask of a build, and what the dashboard puts on
  the wire should be visible in a pull request.

  The published package's spec was 7 minor versions behind ours. Compiled
  side by side, the 31 operations they share are identical - method, path,
  query parameter names and placement, `Content-Type`, positional argument
  order - and `common.js` and `configuration.js` come out byte for byte the
  same. Ours adds the two operations the older spec was missing,
  `GET`/`PUT /compose/{id}/env`; the dashboard does not call them, because
  `src/service/container.js` already reaches those two through raw axios
  with the `text/plain` body and identity `transformResponse` a generated
  client does not produce.
- `src/service/index.spec.js`, which drives all 16 operations the dashboard
  calls through a stub axios and asserts the method and URL each one
  produces, so a regeneration that moves an endpoint fails the suite instead
  of the browser.

### Changed

- The new-language build workflow installs with `--frozen-lockfile` like CI
  and release do. The bare `pnpm install` was the one place a move of
  IceWhale's `latest` tag could have changed what the dashboard was built
  against.
- webpack and vitest resolve `.ts`: the generated client is TypeScript.
  vue-cli's babel rule tests `.m?jsx?` and its resolver knows `.js`/`.vue`,
  so the rule is widened rather than doubled - a second rule would have to
  name `babel-loader`, which pnpm does not hoist.
  `@babel/preset-typescript` was already configured.

## [0.4.42] - 2026-09-06

### Fixed

- The QR code on the two-factor enrolment screen rendered as an unscannable
  192x28 band. The account panel is mounted inside the top bar's dropdown, so
  Bulma's `.navbar-item img { max-height: 1.75rem }` clamped the image height
  while `width="192"` held the width: the QR is now capped-free and square, and
  it is drawn with the 4-module quiet zone the QR spec asks for.

## [0.4.41] - 2026-09-06

A disk without SMART is no longer shown as damaged, and a machine without sensors shows no CPU wattage or temperature.

### Fixed

- On a virtual machine the storage widget tagged the system disk "Damaged"
  while the Storage manager called the same disk healthy: smartctl answers
  for a QEMU disk without any `smart_status`, and LocalStorage read that
  absence as a failure. LocalStorage now sends `smart_status` per disk
  ("passed", "failed" or "unavailable"); the widget and the Storage
  manager's Disk tab both follow it, showing "No SMART data" / "N/A" where
  there is none, and fall back to the `health` Boolean of an older
  LocalStorage.
- The System Status widget printed "0.0W / 0°C" under the CPU dial of a
  machine without a power counter or a thermal zone; the readout is gone
  when neither is available.

## [0.4.40] - 2026-09-06

The contact bar and the app installer point at this distribution, and the news feed from the upstream blog is gone.

### Removed

- The contact bar's Discord link, in-app feedback form and share dialog.
  The feedback form collected a title and a description, appended the
  output of the debug-info endpoint and the browser name and version, and
  opened a prefilled new issue on github.com/IceWhaleTech/CasaOS in a new
  tab; nothing was posted from the page itself. The share dialog offered
  Facebook, Twitter and Reddit buttons for a fixed CasaOS blurb. The form
  and the dialog reported to the message bus on open (connect_feedback,
  connect_sharecasaos), the two links on click (connect_discord,
  connect_github); those events are gone with them, as is the
  browser-info dependency only the form used. The device id the feed
  used to read from baseinfo.conf has no reader left, so its store
  mutation goes too.
- The news feed from the upstream blog. The brand bar fetched an RSS feed
  from blog-casaos.zimaspace.com and scrolled the latest posts next to the
  logo, behind a "Show news feed from CasaOS Blog" switch in the settings
  menu and a consent dialog shown once after the first login. The switch,
  both dialogs, the rss_switch field of the dashboard settings, the store
  flag, the two message bus events (connect_news, dashboardsetting_news)
  and the rss-to-json dependency are removed; nothing in the dashboard
  contacts that blog any more. Fourteen locale keys those features alone
  used are dropped from the 31 language files.

### Changed

- The "In development" button of the smart-home block and the AutoFill
  hint of the app installer pointed at the upstream Discord; they point
  at the issues of inkly/CasaOS now.
- Two links remain in the contact bar: the feedback icon, "Report an
  issue", opens https://github.com/ReCasaOS/CasaOS/issues, and the GitHub
  icon, "Visit our GitHub", opens https://github.com/ReCasaOS/CasaOS, both in
  a new tab with rel="noopener".

### Fixed

- The rule that anchors the contact bar's last tooltip inside the window
  selected `a:last-child .b-tooltip`, but Buefy renders the anchor inside
  the tooltip rather than around it, so the rule never matched. It now
  selects the last tooltip, which is the one the GitHub link carries.

## [0.4.39] - 2026-09-06

### Fixed

- After an update the user signed in on the new services and was thrown back
  to the login page a second or two later. The update dialog signed out
  through the router, whose guard awaits an API call before it navigates;
  started while the services restarted, that call settled only after the
  next login, and the guard then removed the fresh tokens. The upgrade
  rotates the token keys, so the session is over either way: the dialog now
  clears it locally and reloads the page - into the UI just installed - once
  the backend answers, or after two minutes regardless; each probe is given
  three seconds, and log responses still in flight start no second reload.

## [0.4.38] - 2026-09-06

Two-factor authentication, an Environment tab per app, a lint gate, and four dark-theme follow-ups.

### Added

- An Environment tab in the settings of an installed app, beside Settings and
  Compose, edits the app's `.env` file. The file is fetched the first time the
  tab opens, and a read that fails shows the server's message inside the tab.
  Before Apply, the editor checks locally that every line is blank, a `#`
  comment or a key line as compose-go's dotenv parser takes one — `KEY=`,
  `KEY:`, a bare `KEY`, an `export` prefix, names with `.`, `-`, `[` and `]` —
  and names the first line that is none of these. Everything after the `=`,
  the quoting, and the keys CasaOS sets itself (TZ, PUID, PGID) are checked by
  the server, which is asked for a dry run before the real apply; its
  rejection is shown under the editor and the real apply is not sent.
  Applying an empty file deletes `.env`. Applying re-creates the app, so the
  panel closes as it does for Compose, and leaving the Compose or the
  Environment tab with unapplied changes asks before discarding them. The
  Compose tab's notice now says that values defined in the app's `.env` are
  kept as `${VAR}` and that only the other environment values are shown
  resolved. The two `.env` requests bypass the generated client: the read
  takes the body as text, so a file that is only `123` is not parsed as a
  number, and the write goes out as `text/plain`, so an empty file reaches the
  server as nothing rather than as `""` — a request retried after a token
  refresh now keeps its own headers instead of falling back to the JSON
  default.
- Two-factor authentication. When the server answers a login with the
  two-factor status, the login page swaps the password form for a code step:
  the 6-digit code from an authenticator app, or a recovery code through the
  link under the field, with a Back link to the password step. The pre-auth
  token the server hands back is held in the page's component only — nothing
  is written to local storage until the code is verified, and the session is
  then stored by the same path a password login uses. A pre-auth token the
  server rejects, or one past its expiry, returns to the password step with a
  message; a wrong code clears the field and stays. In the account panel a new
  "Two-factor authentication" row shows On or Off and opens the enrolment: the
  password, then the QR code and the key as text with a Copy button, then the
  code from the app to enable it, then the recovery codes, shown once with a
  Copy button. Turning it off asks for the password or a code from the app,
  one or the other; every error stays under its field. The QR code is drawn in
  the browser by the new dependency `qrcode` 1.5.4, imported lazily by the
  enrolment screen, so it is a chunk of its own that the login and home
  bundles do not carry. The strings are in English and French.

### Changed

- ESLint is a CI gate. `pnpm lint` runs `eslint .` instead of
  `vue-cli-service lint`, the `.eslintrc.js` that ESLint 8 with a flat config
  never loaded is removed, and the ci workflow runs the lint before the tests
  and the build, so a pull request with a lint error fails. The lint had been
  red across the tree since the Vue 3 migration (39 564 errors) because
  @antfu/eslint-config's defaults, 2-space and script-first, met a
  tab-indented, template-first tree. The flat config now follows what the
  tree does, each option chosen by counting its violations with ESLint and
  keeping the one with fewer: tabs, single quotes, no semicolons, trailing
  commas, 1tbs braces, template before script; the Vue rule set is the Vue 3
  one. One `eslint --fix --fix-type layout` pass then reformatted 204 files —
  indentation, quotes, semicolons, commas, bracket placement, blank lines —
  and the production build before and after, with named ids and mangling
  disabled so that only the source-dependent hashes had to be normalised, is
  byte-identical for 369 of the 370 emitted files; the 370th is the static
  `public/js/custom.js`, which gained a final newline. The triage of what the
  layout pass left ran the suggestion and problem autofixes (prefer-const,
  object-shorthand, prefer-template, import order, unused imports, and the
  rest named in the commit), then by hand dropped unused catch bindings and
  callback parameters, dead variables, unused `ref` attributes and stale
  eslint-disable comments, and made five changes worth naming:
  `InputGroup.vue` declares the `emit` its computed setter called without
  declaring it; the find() callback of `ExternalLinkPanel.vue` returns false
  on the no-match path; the two Object.keys().map() loops of
  `ComposeConfig.vue` become forEach; the port/IP regex of the validation
  plugin uses non-capturing groups; the mock server's readFile callback
  answers the request on error instead of rendering undefined. What is left
  for a human — `==` comparisons, console.log calls, a prop written from a
  child, event and prop name casing — stays visible as warnings in a named
  config block, not turned off. At the gate: 0 errors, 472 warnings.

### Fixed

- The network graph was empty: apexcharts 4 rejects a chart created before its
  first sample, where apexcharts 3 tolerated it. The chart now mounts with the
  first sample, and Vue 3's reactivity feeds it - the Vue 2-era manual redraw
  is gone with the double render it caused every second.
- The app card menu had its entries centred, and the file browser's menus lost
  their styling too: Buefy 3.1 no longer copies a dropdown's class onto the
  menu it moves under `<body>` for `append-to-body`, so every class-scoped menu
  style silently fell back to Bulma's defaults. A small plugin puts the classes
  back after each rebuild.
- The Appearance list in the settings panel was unreadable in the dark theme:
  Chromium paints the native list on the select's own background, which is
  transparent there, so it came out white under light text.
- After a CasaOS update the browser kept running the previous UI until a
  manual reload - with the system in dark mode, the App Store and Files stayed
  light. The update dialog now reloads the page once it has signed out.
- A login attempted while the server could not be reached showed no message:
  the error path read the message off a response that did not exist and threw
  instead. It now falls back to the request error's own message.

## [0.4.37] - 2026-09-06

The dashboard runs on Vue 3, and it has a dark theme.

### Added

- A dark theme. Appearance is a new row in the settings panel — light, dark,
  or follow the system, which is the default when nothing has been chosen. The
  choice is remembered in the browser and applied before the first paint, so
  there is no flash, and the login and welcome pages honour it too. The
  dashboard's glass cards and widgets were already dark and are identical in
  both themes; what changes is the chrome laid over them — the top bar, the
  modals, dropdowns, forms, toasts, the file browser, the App Store, storage
  ([CasaOS #938](https://github.com/IceWhaleTech/CasaOS/issues/938)).

### Changed

- Vue 2.7 → Vue 3.5, Buefy 0.9 → 3.1, Bulma 0.9 → 1.0, vee-validate 3 → 4,
  vue-router 3 → 4, vuex 3 → 4, vue-i18n 8 → 9, vue-awesome-swiper → Swiper's
  own Vue integration. Vue 2 had been end-of-life since December 2023; the
  dashboard keeps the same components and the same look. The light theme was
  compared declaration by declaration against the previous release and did
  not move, apart from Swiper's own stylesheet.

### Fixed

- Every link had darkened to #0a52bd with Bulma 1's contrast defaults; it is
  the palette's blue again. The focus ring of switches and the placeholder of
  empty selects had vanished — Buefy 3.1 writes them in a form browsers drop.
- The disk summary in the storage widget showed only the disk name in 28
  languages: vue-i18n 9 reads `|` as a plural separator.
- The port field of the app installer rejected every port after the
  validation rules moved API. Its test now checks both accepted and rejected
  inputs.

## [0.4.36] - 2026-09-06

### Changed

- The dashboard is fully translated into French: the seventy-six strings of the
  system package updates, merged storage, the Compose editor, share accounts and
  Time Machine shares that were still shown in English.

## [0.4.35] - 2026-09-05

### Fixed

- The "App launching" row of the settings panel has the shape of its
  neighbours: an icon, a title line and the panel's spacing, where it sat as a
  bare label and button against the edge. Its description line shows the
  current mode.

### Changed

- The settings panel and the App launching dialog are translated into French.
- The CI and release workflows run on Node 24.

## [0.4.34] - 2026-09-05

### Fixed

- The update dialog shows the upgrade log as text. It used to feed the log to
  the Markdown renderer, which merged its lines into paragraphs and left the
  installer's colour codes in view. The log now follows its own tail, and a read
  that fails while the services restart is ignored instead of becoming an
  unhandled rejection.

## [0.4.33] - 2026-09-05

Groundwork for the move to Vue 3, all of it landing on Vue 2 so that the day the
framework changes carries as little as possible.

### Fixed

- The production build was built in development mode. `.env.production` set
  `NODE_ENV=prod` while the build tool tests for `production`, so every release
  shipped Vue's development branches: warnings, the devtools hook and the
  unminified paths. The emitted JavaScript drops from 31.3 MB to 13.0 MB.
- The build no longer writes the build machine's entire environment into the
  bundle. `vue.config.js` replaced the tool's own definitions with
  `JSON.stringify(process.env)`, so the last local build carried the user name
  and home directory of whoever ran it, and a CI build would carry the runner's.
- An app's memory limit that is not one of the slider's marks (a compose file
  edited by hand) no longer displays as 256 MB. The slider snaps to the nearest
  mark instead of falling back to the first.
- The rightmost tooltip of the contact bar no longer hangs off the right edge of
  the window.
- Leaving the drop page within a second of opening it no longer throws.

### Changed

- Seven abandoned dependencies were replaced by their equivalent in code we own:
  the socket plugin, the tooltips, the memory slider, the breakpoint mixin, the
  animation directive, the share links and the CodeMirror wrapper. Eight more
  were removed as unused. Two visible differences came with that, both
  deliberate: the "start sharing your files" hint now stays until its close
  button is used rather than disappearing on any click elsewhere, which is also
  the only way it stops coming back.
- The event bus is a plain emitter rather than a Vue instance, with the same
  `$on`/`$off`/`$emit` surface and each subscriber still isolated from a
  neighbour that throws.

### Added

- Component mount tests. The suite was 37 pure-function tests for 123 components;
  it now also mounts the shell and the highest-traffic surfaces and fails on any
  Vue warning, which is what the framework change will be checked against.

## [0.4.32] - 2026-09-04

### Added

- A shared folder can be marked as a Time Machine destination, in the Share Folder dialog and on an existing share. Macs on the network then offer it as a backup disk ([CasaOS #1030](https://github.com/IceWhaleTech/CasaOS/issues/1030)).

### Fixed

- The App Store no longer stops rendering when no category has apps — with only a third-party store registered the backend answers a single "All" category with a count of 0, which the menu filter dropped, leaving nothing selected ([CasaOS #2537](https://github.com/IceWhaleTech/CasaOS/issues/2537)).

## [0.4.31] - 2026-09-04

First release of the inkly distribution, cut from alvins82's v0.4.30.

### Added

- Edit the Compose file of an installed app from its settings, with server-side validation before apply ([CasaOS-UI #18](https://github.com/alvins82/CasaOS-UI/pull/18)).
- Choose whether apps open inside CasaOS or in a new tab, with a per-app exception list; the default matches the previous behaviour ([CasaOS-UI #19](https://github.com/alvins82/CasaOS-UI/pull/19)).
- Require an account on a shared folder, manage share accounts, and change who can open an existing share ([CasaOS-UI #20](https://github.com/alvins82/CasaOS-UI/pull/20)).

### Changed

- The release workflow builds and publishes the dashboard tarball with the default token; the previous one needed the `@icewhale` npm scope and IceWhale's object storage. CI now runs on pull requests and on `main` instead of skipping on every fork.

### Fixed

- `vitest` is a dependency, so `pnpm test` runs; it had been declared in `package.json` since December 2024 without ever being installed ([CasaOS-UI #17](https://github.com/alvins82/CasaOS-UI/pull/17)).

### Security

- The dashboard no longer sends `baseinfo.conf` — an MD5 of the MAC address, the version and the UI language — to the feed host on every load. The device id stays on the box.

### Verification

- 34 tests pass with `pnpm exec vitest run`; production build completed with `pnpm build`.

## [0.4.30] - 2026-08-15

### Changed

- Keep restart polling and page reload behavior while leaving the shutdown modal in place after a successful shutdown request ([CasaOS-UI #15](https://github.com/alvins82/CasaOS-UI/pull/15)).

### Fixed

- Surface power API failures in the dashboard instead of silently reloading after a failed shutdown or restart ([CasaOS-UI #15](https://github.com/alvins82/CasaOS-UI/pull/15)).

### Verification

- Production build completed with `pnpm exec vue-cli-service build`.

## [0.4.29] - 2026-08-13

### Added

- Open the Files app in an App Store-style dialog on desktop while retaining edge-to-edge behavior on smaller screens ([CasaOS-UI #11](https://github.com/alvins82/CasaOS-UI/pull/11)).
- Add a Rename action for non-system, non-merged storage volumes and refresh Storage Manager after a successful rename ([CasaOS-UI #14](https://github.com/alvins82/CasaOS-UI/pull/14)).

### Changed

- Keep the dashboard sidebar in normal document flow so the dashboard has one scroll surface and lower widgets remain reachable ([CasaOS-UI #12](https://github.com/alvins82/CasaOS-UI/pull/12)).

### Fixed

- Use the CasaOS icon font's `eye-outline` and `eye-off-outline` glyphs for the hidden-files toggle ([CasaOS-UI #13](https://github.com/alvins82/CasaOS-UI/pull/13)).

### Verification

- Production build completed with `pnpm build`.

## [0.4.28] - 2026-08-13

### Added

- Add a Settings flow for checking and applying Debian-family system package updates, including package review, confirmation, live logs, reboot status, and completion reconciliation ([CasaOS-UI #10](https://github.com/alvins82/CasaOS-UI/pull/10)).

### Changed

- Add a persistent Show Search Bar setting and let the sidebar grow with its contents instead of clipping lower widgets behind a fixed scrollbar ([CasaOS-UI #8](https://github.com/alvins82/CasaOS-UI/pull/8)).
- Show the physical parent disk model and path alongside storage filesystems ([CasaOS-UI #9](https://github.com/alvins82/CasaOS-UI/pull/9)).

### Fixed

- Use actual filesystem usage for storage bars and display an em dash for unmounted filesystems instead of misleading `NaN` values ([CasaOS-UI #9](https://github.com/alvins82/CasaOS-UI/pull/9)).

### Verification

- Production build completed with `pnpm build`.

## [0.4.27] - 2026-08-12

### Fixed

- Keep system storage out of merged storage sources.
- Preserve system AppData at `/DATA/AppData` while `/DATA` uses external storage.
- Preserve disconnected merged sources and provide an explicit merged-storage removal flow.

### Verification

- Production build completed with `pnpm build`.

## [0.4.26] - 2026-08-12

### Fixed

- Open qBittorrent in a top-level browser tab instead of the in-app iframe. Its WebUI does not initialize correctly when embedded in CasaOS because it relies on cross-origin `window.parent` behavior.

### Verification

- Production build completed with `pnpm build`.

## [0.4.25] - 2026-08-12

### Added

- Dedicated merged-storage tab for merged disks.
- In-page app iframe dialogs with the App Store modal layout, backdrop, header, close button, transition, and responsive mobile behavior.
