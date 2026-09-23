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
// commit that is not the deployed one. An app that follows tags is worded by the
// tag the server chose; the dashboard compares none. With no eligible tag, the
// check's error says so, naming the filter, and the tag it keeps from an earlier
// check is not read.
export function checkSummary(app) {
	if (!app.check)
		return { message: 'Not checked yet.', params: {} }
	if (app.check.error)
		return { message: 'The check failed: {error}', params: { error: app.check.error } }
	if (app.follow === 'tags') {
		const tag = app.check.remote_tag
		// a check made before the app followed tags
		if (!tag)
			return { message: 'Not checked yet.', params: {} }
		// the deployed tag on another commit: the tab's warning says the rest
		if (app.check.tag_moved)
			return { message: 'The tag {tag} moved.', params: { tag } }
		if (app.deployed && app.deployed.tag === tag)
			return { message: 'Up to date ({tag})', params: { tag } }
		const deployed = app.deployed ? (app.deployed.tag || shortCommit(app.deployed.commit)) : '-'
		return { message: 'Newest tag {tag} · deployed {deployed}', params: { tag, deployed } }
	}
	if (app.new_commits)
		return { message: 'Commit {commit} is new on the branch.', params: { commit: shortCommit(app.check.remote_commit) } }
	return { message: 'The branch is at {commit}: up to date.', params: { commit: shortCommit(app.check.remote_commit) } }
}

// A deployed version as the owner knows it: `v1.4.1 (abc1234)`, or the commit
// alone when it was deployed from a branch.
export function versionName(version) {
	return version.tag ? `${version.tag} (${shortCommit(version.commit)})` : shortCommit(version.commit)
}

// A version tag as the server reads one: strict semver after one leading `v`.
const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

// Semver precedence of two pre-release identifiers: numbers below words,
// numbers by value, words in ASCII order.
function compareIdentifiers(a, b) {
	const numeric = [/^\d+$/.test(a), /^\d+$/.test(b)]
	if (numeric[0] && numeric[1])
		return Number(a) - Number(b)
	if (numeric[0] !== numeric[1])
		return numeric[0] ? -1 : 1
	if (a === b)
		return 0
	return a < b ? -1 : 1
}

// Whether tag `tag` is a lower version than tag `than`, by semver precedence;
// false when either is not a version. Only the confirmation of an older tag asks:
// the order of the tags and the choice of the newest are the server's.
export function isOlderTag(tag, than) {
	const [a, b] = [VERSION.exec(tag || ''), VERSION.exec(than || '')]
	if (!a || !b)
		return false
	for (const part of [1, 2, 3]) {
		if (a[part] !== b[part])
			return Number(a[part]) < Number(b[part])
	}
	// a pre-release comes before its release
	if (!a[4] || !b[4])
		return Boolean(a[4]) && !b[4]
	const [x, y] = [a[4].split('.'), b[4].split('.')]
	for (let i = 0; i < Math.min(x.length, y.length); i++) {
		const order = compareIdentifiers(x[i], y[i])
		if (order)
			return order < 0
	}
	return x.length < y.length
}

// What a tag of the list is, the list coming highest first: the version that
// runs (the same name on the same commit), the newest, a version the history
// keeps (one that ran: the server keeps no failed build). The words are
// language keys.
export function tagLabels(app, tag, index) {
	const deployed = Boolean(app.deployed) && app.deployed.tag === tag.name && app.deployed.commit === tag.commit
	const kept = (app.history || []).some(entry => entry.commit === tag.commit && ['deployed', 'adopted'].includes(entry.outcome))
	return [deployed && 'deployed', index === 0 && 'newest', !deployed && kept && 'in history'].filter(Boolean)
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
