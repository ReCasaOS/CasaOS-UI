/**
 * What `GET /compose/{id}/containers` means, per service.
 *
 * This lives apart from the component because every field below is a small
 * judgement about Docker's answer rather than a rendering detail, and each one
 * has a way of lying: an empty `Health` is not "unhealthy", and `ExitCode` is
 * only ever filled in by docker compose for a container that really stopped, so
 * reading it on a running one reports a clean exit for something that never
 * exited.
 */

// Docker's `State` vocabulary, in words that say what happened to the service.
export const CONTAINER_STATES = {
	running: { label: 'Running', hint: 'The service is up.', type: 'is-success' },
	restarting: { label: 'Restarting', hint: 'Docker is bringing it back up, usually because it keeps failing.', type: 'is-warning' },
	paused: { label: 'Paused', hint: 'Frozen on purpose: it keeps its memory and answers nothing.', type: 'is-warning' },
	exited: { label: 'Stopped', hint: 'It ran and is not running any more.', type: 'is-light' },
	created: { label: 'Never started', hint: 'The container exists but has never been started.', type: 'is-light' },
	removing: { label: 'Being removed', hint: 'Docker is deleting this container.', type: 'is-warning' },
	dead: { label: 'Dead', hint: 'Docker could not remove it, and it will not start again on its own.', type: 'is-danger' },
	// Ours, not Docker's: a service declared in the compose file that holds no container.
	absent: { label: 'No container', hint: 'The compose file declares this service, but Docker runs no container for it.', type: 'is-light' },
}

export const CONTAINER_HEALTH = {
	healthy: { label: 'Healthy', type: 'is-success' },
	unhealthy: { label: 'Unhealthy', type: 'is-danger' },
	starting: { label: 'Starting up', type: 'is-warning' },
}

// What the dashboard says of an app whose check is not passing. A healthy app and an
// app with no check say nothing: the card already says it runs.
export function appHealthWarning(item) {
	if (!item || item.status !== 'running')
		return null
	if (item.health === 'unhealthy')
		return { label: 'Unhealthy', dot: 'is-unhealthy', text: 'has-text-danger' }
	if (item.health === 'starting')
		return { label: 'Starting up', dot: 'is-starting', text: 'has-text-warning' }

	return null
}

/**
 * The last runs of a health check, as lines to read: when, passed or failed, and
 * what the command printed (empty for an account that is not the owner).
 *
 * @param {object[]} checks `checks` of `GET /compose/{id}/containers/{id}/health`
 */
export function healthRuns(checks) {
	const today = new Date().toDateString()
	// the time alone for a run of today; a check that runs once a day spreads its last runs over a week
	const when = at => at.toDateString() === today ? at.toLocaleTimeString() : at.toLocaleString()

	return (checks || []).map(check => ({
		at: check.started_at ? when(new Date(check.started_at)) : '',
		passed: check.exit_code === 0,
		exitCode: check.exit_code,
		output: check.output || '',
	}))
}

// `Created` is when the container was made, which a restart does not change, so
// Docker's own `Status` line is the only honest source of an uptime here:
// "Up 3 hours", "Up 2 minutes (healthy)", "Up 5 minutes (Paused)".
export function uptime(status) {
	const text = String(status || '').trim()
	if (!text.startsWith('Up '))
		return ''

	const parenthetical = text.indexOf(' (')
	return (parenthetical === -1 ? text : text.slice(0, parenthetical)).slice(3).trim()
}

/**
 * Host ports someone can actually reach. Docker lists one publisher per address
 * family, so the same mapping arrives twice on a dual-stack host; and a
 * container port that was never published arrives with `PublishedPort` 0.
 */
export function publishedPorts(publishers) {
	const mappings = (publishers || [])
		.filter(publisher => publisher && publisher.PublishedPort)
		.map(publisher => `${publisher.PublishedPort} -> ${publisher.TargetPort}/${publisher.Protocol || 'tcp'}`)

	return [...new Set(mappings)]
}

/**
 * Docker reports health only while a container runs, and only when its image
 * declares a HEALTHCHECK. An empty value therefore means two different things,
 * neither of which is "unhealthy": no check at all when the container is
 * running, nothing knowable while it is not.
 *
 * @returns {{tag: object}|{text: string}} a tag to show, or text (possibly empty)
 */
export function healthCell(row) {
	const known = CONTAINER_HEALTH[row.health]
	if (known)
		return { tag: known }

	return { text: row.state === 'running' ? 'No health check' : '' }
}

/**
 * Which container of a service to open a terminal or a log view on.
 *
 * A service holds a list, so something has to choose when the caller did not: a
 * running container beats a stopped replica, because a shell can only be opened
 * in one that runs. An empty answer means the service has nothing to open.
 *
 * The caller's pick is only honoured while the list still holds it: a container
 * removed between the moment a row was drawn and the moment it was clicked is a
 * dead id, and opening a terminal on one gets a socket that closes with nothing
 * to show for it.
 *
 * @param {object[]} list the containers of one service
 * @param {string} [wanted] the container the caller already picked, if any
 * @returns {string} a container id, or '' when there is none
 */
export function pickContainerId(list, wanted) {
	const containers = list || []
	if (wanted && containers.some(container => container.ID === wanted))
		return wanted

	return (containers.find(container => container.State === 'running') || containers[0] || {}).ID || ''
}

/**
 * @param {object} data the `data` of the response: `{main, containers}`
 * @returns {object[]} one row per container, the main service's containers first
 */
export function containerRows(data) {
	const containers = data?.containers ?? {}
	const main = data?.main

	return Object.entries(containers)
		.sort(([a], [b]) => (b === main) - (a === main) || a.localeCompare(b))
		.flatMap(([service, list]) => {
			// A service the compose file declares can be running nothing at all -- the
			// endpoint reports it as an empty list rather than omitting it. Dropping it
			// here would hide the half of a stack that failed to come up, which is the
			// one thing someone opens this tab to find out.
			if (!list || !list.length)
				return [{ key: `service:${service}`, service, name: '', replicas: 0, id: '', image: '', state: 'absent', health: '', uptime: '', ports: [], exitCode: null }]

			// Docker answers in no particular order; by name keeps a scaled service's
			// replicas from swapping rows between two refreshes.
			return [...list]
				.sort((a, b) => String(a.Name || a.ID).localeCompare(String(b.Name || b.ID)))
				.map(container => ({
					key: container.ID,
					service,
					name: container.Name || container.ID,
					replicas: list.length,
					id: container.ID,
					image: container.Image,
					state: container.State,
					health: container.Health || '',
					uptime: uptime(container.Status),
					ports: publishedPorts(container.Publishers),
					exitCode: container.State === 'exited' || container.State === 'dead' ? container.ExitCode ?? null : null,
				}))
		})
}

/**
 * What can be done to a container, given the state Docker reports for it.
 *
 * Restart is always paired with one of start or stop rather than offered alone,
 * because the pair is what someone opens this tab to do: a stack whose database
 * wedged needs that one service bounced, not the whole app taken down and
 * brought back.
 *
 * Two states are deliberately offered nothing. A service the compose file
 * declares but Docker runs no container for has no id to act on; and one being
 * removed is already going away, so every button on it is a race the caller
 * loses.
 *
 * `paused` counts as running: Docker reports a paused container as running, it
 * can be stopped, and starting it does nothing at all.
 *
 * @param {object} row a row from containerRows()
 * @returns {{action: string, icon: string, label: string}[]} the buttons to draw, in order, or none
 */
export function containerActions(row) {
	if (!row.id || row.state === 'removing')
		return []

	const up = row.state === 'running' || row.state === 'restarting' || row.state === 'paused'

	return [
		up
			? { action: 'stop', icon: 'stop', label: 'Stop' }
			: { action: 'start', icon: 'play', label: 'Start' },
		{ action: 'restart', icon: 'restart', label: 'Restart' },
	]
}
