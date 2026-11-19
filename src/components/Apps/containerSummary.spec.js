import { describe, expect, it } from 'vitest'
import { appHealthWarning, containerActions, containerRows, healthCell, healthRuns, pickContainerId, publishedPorts, uptime } from './containerSummary'

// A real answer, trimmed to the fields the tab reads: each service holds a LIST of
// containers, `worker` is scaled to two and `idle` is declared but running nothing.
const DATA = {
	main: 'jellyfin',
	containers: {
		redis: [{
			ID: 'r1',
			Name: 'media-redis-1',
			Image: 'redis:7',
			State: 'running',
			Status: 'Up 3 hours',
			Health: '',
			ExitCode: 0,
			Publishers: [],
		}],
		jellyfin: [{
			ID: 'j1',
			Name: 'media-jellyfin-1',
			Image: 'jellyfin/jellyfin:10.9',
			State: 'running',
			Status: 'Up 2 minutes (healthy)',
			Health: 'healthy',
			ExitCode: 0,
			Publishers: [
				{ URL: '0.0.0.0', TargetPort: 8096, PublishedPort: 8096, Protocol: 'tcp' },
				{ URL: '::', TargetPort: 8096, PublishedPort: 8096, Protocol: 'tcp' },
				{ URL: '', TargetPort: 1900, PublishedPort: 0, Protocol: 'udp' },
			],
		}],
		backup: [{
			ID: 'b1',
			Name: 'media-backup-1',
			Image: 'alpine',
			State: 'exited',
			Status: 'Exited (137) 5 minutes ago',
			Health: '',
			ExitCode: 137,
			Publishers: [],
		}],
		worker: [
			{ ID: 'w2', Name: 'media-worker-2', Image: 'worker:1', State: 'exited', Status: 'Exited (1) 1 minute ago', Health: '', ExitCode: 1, Publishers: [] },
			{ ID: 'w1', Name: 'media-worker-1', Image: 'worker:1', State: 'running', Status: 'Up 3 hours', Health: '', ExitCode: 0, Publishers: [] },
		],
		idle: [],
	},
}

describe('uptime', () => {
	it('reads how long the container has been up out of the Status line, parenthetical aside', () => {
		expect(uptime('Up 3 hours')).toBe('3 hours')
		expect(uptime('Up 2 minutes (healthy)')).toBe('2 minutes')
		expect(uptime('Up About a minute (health: starting)')).toBe('About a minute')
		expect(uptime('Up 5 minutes (Paused)')).toBe('5 minutes')
	})

	it('has nothing to say about a container that is not up', () => {
		expect(uptime('Exited (0) 5 minutes ago')).toBe('')
		expect(uptime('Restarting (1) 3 seconds ago')).toBe('')
		expect(uptime('Created')).toBe('')
		expect(uptime(undefined)).toBe('')
	})
})

describe('publishedPorts', () => {
	it('lists each mapping once and drops a port nobody published', () => {
		expect(publishedPorts(DATA.containers.jellyfin[0].Publishers)).toEqual(['8096 -> 8096/tcp'])
		expect(publishedPorts([])).toEqual([])
		expect(publishedPorts(undefined)).toEqual([])
	})
})

describe('healthCell', () => {
	it('names the three health states Docker reports', () => {
		expect(healthCell({ state: 'running', health: 'healthy' }).tag.label).toBe('Healthy')
		expect(healthCell({ state: 'running', health: 'unhealthy' }).tag.label).toBe('Unhealthy')
		expect(healthCell({ state: 'running', health: 'starting' }).tag.label).toBe('Starting up')
	})

	it('never calls an image without a HEALTHCHECK unhealthy', () => {
		expect(healthCell({ state: 'running', health: '' })).toEqual({ text: 'No health check' })
	})

	it('claims nothing about a container that is not running, where Docker reports no health at all', () => {
		expect(healthCell({ state: 'exited', health: '' })).toEqual({ text: '' })
		expect(healthCell({ state: 'created', health: '' })).toEqual({ text: '' })
	})
})

describe('pickContainerId', () => {
	it('opens the container the caller named, whichever one it is', () => {
		expect(pickContainerId(DATA.containers.worker, 'w2')).toBe('w2')
	})

	it('falls back when the container the caller named is gone from the list', () => {
		// The row named it, then Docker removed it, then it was clicked: opening a
		// terminal on that id gets a socket that closes with nothing to show.
		expect(pickContainerId(DATA.containers.worker, 'w9')).toBe('w1')
		expect(pickContainerId(DATA.containers.backup, 'b9')).toBe('b1')
		expect(pickContainerId([], 'w9')).toBe('')
		expect(pickContainerId(undefined, 'w9')).toBe('')
	})

	it('prefers a running container to a stopped replica, since only one of them has a shell', () => {
		expect(pickContainerId(DATA.containers.worker)).toBe('w1')
		expect(pickContainerId(DATA.containers.backup)).toBe('b1')
	})

	it('has nothing to open on a service Docker runs no container for', () => {
		expect(pickContainerId([])).toBe('')
		expect(pickContainerId(undefined)).toBe('')
	})
})

describe('containerRows', () => {
	it('puts the main service first, then the rest by name', () => {
		expect(containerRows(DATA).map(row => row.service)).toEqual(['jellyfin', 'backup', 'idle', 'redis', 'worker', 'worker'])
	})

	it('keeps every replica of a scaled service, in a stable order', () => {
		const workers = containerRows(DATA).filter(row => row.service === 'worker')
		expect(workers.map(row => row.id)).toEqual(['w1', 'w2'])
		expect(workers.map(row => row.name)).toEqual(['media-worker-1', 'media-worker-2'])
		// Every replica carries the count, which is what tells the table to name them.
		expect(workers.map(row => row.replicas)).toEqual([2, 2])
		expect(workers[1].exitCode).toBe(1)
	})

	it('shows a service Docker runs nothing for rather than dropping it', () => {
		const [idle] = containerRows(DATA).filter(row => row.service === 'idle')
		expect(idle).toMatchObject({ state: 'absent', id: '', replicas: 0, ports: [], exitCode: null })
	})

	it('names the container of a lone one too, but says it stands alone', () => {
		const [main] = containerRows(DATA)
		expect(main).toMatchObject({ name: 'media-jellyfin-1', replicas: 1 })
	})

	it('reports an exit code only for a container that actually stopped', () => {
		const rows = Object.fromEntries(containerRows(DATA).map(row => [row.service, row]))
		expect(rows.backup.exitCode).toBe(137)
		// `ExitCode` is 0 on the running ones, which is not "it exited cleanly".
		expect(rows.jellyfin.exitCode).toBeNull()
		expect(rows.redis.exitCode).toBeNull()
	})

	it('carries the fields the table shows', () => {
		const [main] = containerRows(DATA)
		expect(main).toMatchObject({
			id: 'j1',
			image: 'jellyfin/jellyfin:10.9',
			state: 'running',
			health: 'healthy',
			uptime: '2 minutes',
			ports: ['8096 -> 8096/tcp'],
		})
	})

	it('survives an app with no container at all', () => {
		expect(containerRows({})).toEqual([])
		expect(containerRows(undefined)).toEqual([])
	})
})

describe('what can be done to a container', () => {
	const row = (state, id = '3f1c') => ({ id, state })

	it('offers stop and restart to anything that is up', () => {
		for (const state of ['running', 'restarting', 'paused']) {
			expect(containerActions(row(state)).map(a => a.action)).toEqual(['stop', 'restart'])
		}
	})

	it('offers start and restart to anything that is not', () => {
		for (const state of ['exited', 'created', 'dead']) {
			expect(containerActions(row(state)).map(a => a.action)).toEqual(['start', 'restart'])
		}
	})

	it('offers nothing on a service Docker runs no container for', () => {
		// the row the tab draws for a service declared in the compose file but absent
		expect(containerActions({ id: '', state: 'absent' })).toEqual([])
	})

	it('offers nothing while Docker is removing the container', () => {
		// every button here is a race the caller loses
		expect(containerActions(row('removing'))).toEqual([])
	})
})

describe('appHealthWarning', () => {
	it('speaks only for a running app whose check is not passing', () => {
		expect(appHealthWarning({ status: 'running', health: 'unhealthy' }).label).toBe('Unhealthy')
		expect(appHealthWarning({ status: 'running', health: 'starting' }).label).toBe('Starting up')
		expect(appHealthWarning({ status: 'running', health: 'healthy' })).toBeNull()
		// no check at all, and a box too old to send the field
		expect(appHealthWarning({ status: 'running', health: '' })).toBeNull()
		expect(appHealthWarning({ status: 'running' })).toBeNull()
		// a stopped app says stopped, whatever its last verdict was
		expect(appHealthWarning({ status: 'exited', health: 'unhealthy' })).toBeNull()
		expect(appHealthWarning(undefined)).toBeNull()
	})
})

describe('healthRuns', () => {
	it('reads each run as passed or failed, with what it printed', () => {
		const runs = healthRuns([
			{ started_at: '2026-11-19T18:40:37Z', exit_code: 2, output: 'no response' },
			{ started_at: '2026-11-19T18:40:07Z', exit_code: 0 },
		])

		expect(runs.map(run => run.passed)).toEqual([false, true])
		expect(runs[0].exitCode).toBe(2)
		expect(runs[0].output).toBe('no response')
		expect(runs[1].output).toBe('')
		expect(runs[0].at).not.toBe('')
	})

	it('has nothing to say of a check that never ran', () => {
		expect(healthRuns(undefined)).toEqual([])
		expect(healthRuns([])).toEqual([])
	})
})
