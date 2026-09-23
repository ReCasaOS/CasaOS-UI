// The rules and the words of git apps, kept out of the components so they can be
// checked without mounting one.

// A state or an outcome, as it is shown. The same words serve the card's badge,
// the Repository tab's state and the history of deployments.
const LABELS = {
	adopted: 'Adopted',
	deployed: 'Deployed',
	building: 'Building',
	deploying: 'Deploying',
	build_failed: 'Build failed',
	rolled_back: 'Rolled back',
	failed: 'Deployment failed',
	unreachable: 'Repository unreachable',
	interrupted: 'Interrupted',
}

// What went, or is going, the way it should. Anything else is a failure.
const GOOD = ['adopted', 'deployed', 'building', 'deploying']

// `type` is a Bulma colour: the card's tooltip draws is-success green and
// is-danger red, and draws nothing else.
export function outcomeTag(value) {
	return { label: LABELS[value] || String(value), type: GOOD.includes(value) ? 'is-success' : 'is-danger' }
}

// The badge for a grid item's `git`, or null. One at most, since badges sit on
// top of the icon; a state says more than new commits do: the commit of a
// failed build is still new, and the failure is what the owner has to see.
export function gitBadge(git) {
	if (!git)
		return null
	if (git.state && git.state !== 'idle')
		return outcomeTag(git.state)
	return git.new_commits ? { label: 'New commits', type: 'is-success' } : null
}

// A registered git app no deployment has given a container. The grid lists it
// anyway, with no status, so that its Repository tab and its deletion stay in
// reach; a compose app always has one, "unknown" at worst.
export function withoutContainer(item) {
	return Boolean(item.git) && item.git.deployed === false && !item.status
}

// The only options the server calls sensitive, in words.
const SENSITIVE = {
	privileged: 'Privileged mode',
	network_mode_host: 'Host network',
	pid_host: 'Host process namespace',
	cap_add: 'Added capabilities',
	devices: 'Host devices',
	docker_socket: 'Docker socket',
}

export function sensitiveLabel(option) {
	return SENSITIVE[option] || String(option)
}

// The services whose options reach beyond their own container, for the review
// step to call out before anything runs.
export function sensitiveServices(compose) {
	return ((compose && compose.services) || []).filter(service => service.sensitive && service.sensitive.length > 0)
}

export function shortCommit(commit) {
	return String(commit || '').slice(0, 7)
}

// The last check, in words. `new_commits` is the server's: the branch has a
// commit that is not the deployed one.
export function checkSummary(app) {
	if (!app.check)
		return { message: 'Not checked yet.', params: {} }
	if (app.check.error)
		return { message: 'The check failed: {error}', params: { error: app.check.error } }
	if (app.new_commits)
		return { message: 'Commit {commit} is new on the branch.', params: { commit: shortCommit(app.check.remote_commit) } }
	return { message: 'The branch is at {commit}: up to date.', params: { commit: shortCommit(app.check.remote_commit) } }
}

// A kept version can be switched back to, except the one already deployed.
export function canRevert(app, entry) {
	return Boolean(entry.revertable) && entry.commit !== (app.deployed && app.deployed.commit)
}

// Whether CasaOS can follow this repository: a registered app, or an adoptable
// folder on a branch with a remote. Detached HEAD answers an empty branch, no
// remote an empty remote, and the server refuses to adopt either.
export function canFollow(app) {
	return app.origin !== 'adoptable' || Boolean(app.remote && app.branch)
}

// A check answers as it starts, and says it has ended only by the operation
// leaving its app. `app` is that first answer and `read` resolves to the app as
// it is now; the reading stops once no check runs -- a deployment the check
// starts is followed by its own events -- or once `stop` says so, and resolves to
// the last app read.
export async function checkEnded(app, read, { stop = () => false, every = 2000 } = {}) {
	let current = app
	while (current.operation && current.operation.kind === 'check' && !stop()) {
		await new Promise(resolve => setTimeout(resolve, every))
		current = await read()
	}
	return current
}

// The name a compose project would take from the repository: the last segment
// of its URL without `.git`, lowercased, with anything but a letter, a digit, `_`
// or `-` turned into `-`, and starting with a letter or a digit.
export function projectName(url) {
	const segment = String(url || '').trim().replace(/\/+$/, '').split(/[/:]/).pop()
	return segment.replace(/\.git$/i, '').toLowerCase().replace(/[^\w-]+/g, '-').replace(/^[^a-z0-9]+/, '')
}

// The server keeps the last 64 KiB of a build log; a live one keeps as much.
const LOG_LIMIT = 64 * 1024

// Build output as the progress events bring it: lines, which may or may not end
// with a newline.
export function appendLog(log, lines) {
	if (!lines)
		return log
	const next = log + (lines.endsWith('\n') ? lines : `${lines}\n`)
	return next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next
}

// Seconds in each unit timeAgo words a time in, largest first.
const UNITS = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]

// How long ago `at` (RFC 3339) was, in the words of `locale`, a vue-i18n locale
// such as en_us: "3 minutes ago", "il y a 3 minutes". A time in the future is a
// clock that disagrees with this one, and reads "now".
export function timeAgo(at, locale, now = Date.now()) {
	const seconds = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000))
	const [unit, size] = UNITS.find(entry => seconds >= entry[1]) || UNITS.at(-1)
	return new Intl.RelativeTimeFormat(locale.replace('_', '-'), { numeric: 'auto' }).format(-Math.floor(seconds / size), unit)
}
