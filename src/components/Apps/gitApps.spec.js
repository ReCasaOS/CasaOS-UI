import { describe, expect, it, vi } from 'vitest'
import { appendLog, canFollow, canRevert, checkEnded, checkSummary, gitBadge, isOlderTag, outcomeTag, projectName, sensitiveLabel, sensitiveServices, shortCommit, tagLabels, timeAgo, versionName, withoutContainer } from './gitApps'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

describe('the badge of a git app on its card', () => {
	it.each([
		['building', 'Building', 'is-success'],
		['deploying', 'Deploying', 'is-success'],
		['build_failed', 'Build failed', 'is-danger'],
		['rolled_back', 'Rolled back', 'is-danger'],
		['failed', 'Deployment failed', 'is-danger'],
		['unreachable', 'Repository unreachable', 'is-danger'],
		['interrupted', 'Interrupted', 'is-danger'],
	])('names the state %s', (state, label, type) => {
		expect(gitBadge({ state, new_commits: false })).toEqual({ label, type })
	})

	it('says new commits wait only when nothing else is going on', () => {
		expect(gitBadge({ state: 'idle', new_commits: true })).toEqual({ label: 'New commits', type: 'is-success' })
		// the commit of a failed build is still new: the failure is the news
		expect(gitBadge({ state: 'build_failed', new_commits: true }).label).toBe('Build failed')
	})

	it('says nothing of an idle app with nothing new, nor of an app that is not a git app', () => {
		expect(gitBadge({ state: 'idle', new_commits: false })).toBeNull()
		expect(gitBadge(undefined)).toBeNull()
	})
})

describe('a git app no deployment has given a container', () => {
	const git = { new_commits: false, state: 'build_failed', deployed: false }

	it('is the grid item with no status and a git app never deployed', () => {
		expect(withoutContainer({ app_type: 'v2app', name: 'jarvis', status: '', git })).toBe(true)
	})

	it('is not an app whose first deployment left containers, nor a deployed one, nor any other app', () => {
		expect(withoutContainer({ app_type: 'v2app', name: 'jarvis', status: 'exited', git })).toBe(false)
		expect(withoutContainer({ app_type: 'v2app', name: 'jarvis', status: '', git: { ...git, deployed: true } })).toBe(false)
		expect(withoutContainer({ app_type: 'v2app', name: 'syncthing', status: '' })).toBe(false)
	})
})

describe('the outcome of a deployment', () => {
	it('tells what went right from what did not', () => {
		expect(outcomeTag('adopted')).toEqual({ label: 'Adopted', type: 'is-success' })
		expect(outcomeTag('deployed')).toEqual({ label: 'Deployed', type: 'is-success' })
		expect(outcomeTag('rolled_back')).toEqual({ label: 'Rolled back', type: 'is-danger' })
		expect(outcomeTag('interrupted')).toEqual({ label: 'Interrupted', type: 'is-danger' })
	})

	it('shows an outcome it does not know as it came', () => {
		expect(outcomeTag('exploded').label).toBe('exploded')
	})
})

describe('the review of a compose summary', () => {
	it('keeps the services with a sensitive option, and survives no summary', () => {
		const compose = {
			files: ['compose.yaml'],
			services: [
				{ name: 'web', build: true, sensitive: ['privileged', 'network_mode: host'] },
				{ name: 'db', build: false, sensitive: [] },
				{ name: 'cache', build: false, sensitive: null },
			],
		}
		expect(sensitiveServices(compose).map(s => s.name)).toEqual(['web'])
		expect(sensitiveServices(null)).toEqual([])
	})

	it.each([
		['privileged', 'Privileged mode'],
		['network_mode_host', 'Host network'],
		['pid_host', 'Host process namespace'],
		['cap_add', 'Added capabilities'],
		['devices', 'Host devices'],
		['docker_socket', 'Docker socket'],
	])('words the sensitive option %s', (option, label) => {
		expect(sensitiveLabel(option)).toBe(label)
	})

	it('shows a sensitive option it does not know as it came', () => {
		expect(sensitiveLabel('ipc_host')).toBe('ipc_host')
	})
})

describe('a check, which answers as it starts', () => {
	const checking = { app: 'jarvis', operation: { kind: 'check', commit: '', started_at: '2026-09-16T10:05:00Z' } }
	const done = { app: 'jarvis', operation: null, cloned: true }

	it('reads nothing when no check runs', async () => {
		const read = vi.fn()
		expect(await checkEnded(done, read, { every: 0 })).toBe(done)
		expect(read).not.toHaveBeenCalled()
	})

	it('reads the app until the check has ended', async () => {
		const read = vi.fn().mockResolvedValueOnce(checking).mockResolvedValueOnce(done)
		expect(await checkEnded(checking, read, { every: 0 })).toBe(done)
		expect(read).toHaveBeenCalledTimes(2)
	})

	it('stops at a deployment the check started, which has events of its own', async () => {
		const deploying = { app: 'jarvis', operation: { kind: 'deploy', commit: B, started_at: '2026-09-16T10:05:09Z' } }
		const read = vi.fn().mockResolvedValueOnce(deploying)
		expect(await checkEnded(checking, read, { every: 0 })).toBe(deploying)
	})

	it('stops when told to, with the last app read', async () => {
		const read = vi.fn().mockResolvedValue(checking)
		expect(await checkEnded(checking, read, { every: 0, stop: () => read.mock.calls.length === 2 })).toBe(checking)
		expect(read).toHaveBeenCalledTimes(2)
	})
})

describe('the last check, in words', () => {
	const at = '2026-09-16T10:05:00Z'

	it('says when nothing was checked yet', () => {
		expect(checkSummary({ check: null }).message).toBe('Not checked yet.')
	})

	it('gives the error of a failed check', () => {
		expect(checkSummary({ check: { at, remote_commit: '', error: 'Permission denied (publickey)' } }))
			.toEqual({ message: 'The check failed: {error}', params: { error: 'Permission denied (publickey)' } })
	})

	it('names the new commit, and only when there is one', () => {
		expect(checkSummary({ check: { at, remote_commit: B, error: '' }, new_commits: true }))
			.toEqual({ message: 'Commit {commit} is new on the branch.', params: { commit: 'bbbbbbb' } })
		expect(checkSummary({ check: { at, remote_commit: A, error: '' }, new_commits: false }))
			.toEqual({ message: 'The branch is at {commit}: up to date.', params: { commit: 'aaaaaaa' } })
	})
})

describe('what the Repository tab offers', () => {
	it('offers a revert to a kept version that is not the deployed one', () => {
		const app = { deployed: { commit: A } }
		expect(canRevert(app, { commit: B, revertable: true })).toBe(true)
		expect(canRevert(app, { commit: A, revertable: true })).toBe(false)
		expect(canRevert(app, { commit: B, revertable: false })).toBe(false)
	})

	it('follows a registered app, and an adoptable folder only on a branch with a remote', () => {
		expect(canFollow({ origin: 'created', remote: '', branch: '' })).toBe(true)
		expect(canFollow({ origin: 'adoptable', remote: 'https://example.com/a.git', branch: 'main' })).toBe(true)
		expect(canFollow({ origin: 'adoptable', remote: 'https://example.com/a.git', branch: '' })).toBe(false)
		expect(canFollow({ origin: 'adoptable', remote: '', branch: 'main' })).toBe(false)
	})

	it('shortens a commit to seven digits', () => {
		expect(shortCommit(A)).toBe('aaaaaaa')
		expect(shortCommit(null)).toBe('')
	})
})

describe('the name an app takes from its repository', () => {
	it.each([
		['https://github.com/owner/jarvis.git', 'jarvis'],
		['git@github.com:owner/Jarvis.git', 'jarvis'],
		['https://gitlab.com/group/my.app/', 'my-app'],
		['ssh://git@host:2222/srv/_private.git', 'private'],
		['', ''],
	])('%s gives %s', (url, name) => {
		expect(projectName(url)).toBe(name)
	})
})

describe('a build log as it arrives', () => {
	it('ends every piece with a newline, once', () => {
		expect(appendLog('', 'step 1/3')).toBe('step 1/3\n')
		expect(appendLog('step 1/3\n', 'step 2/3\n')).toBe('step 1/3\nstep 2/3\n')
		expect(appendLog('kept\n', '')).toBe('kept\n')
	})

	it('keeps the last 64 KiB, as the server does', () => {
		const log = appendLog('x'.repeat(64 * 1024), 'last')
		expect(log).toHaveLength(64 * 1024)
		expect(log.endsWith('xlast\n')).toBe(true)
	})
})

describe('how long ago a webhook delivery came', () => {
	const now = Date.UTC(2026, 8, 23, 12, 0, 0)
	const before = seconds => new Date(now - seconds * 1000).toISOString()

	it.each([
		[0, 'en_us', 'now'],
		[45, 'en_us', '45 seconds ago'],
		[180, 'en_us', '3 minutes ago'],
		[180, 'fr_fr', 'il y a 3 minutes'],
		[5400, 'en_us', '1 hour ago'],
		[3 * 86400, 'fr_fr', 'il y a 3 jours'],
	])('%i seconds before, in %s, is %s', (seconds, locale, words) => {
		expect(timeAgo(before(seconds), locale, now)).toBe(words)
	})

	it('reads a time in the future as now: the clocks disagree, nothing came later', () => {
		expect(timeAgo(before(-30), 'en_us', now)).toBe('now')
	})
})

describe('an app that follows tags', () => {
	const at = '2026-09-23T10:05:00Z'
	const tagApp = (check, deployed = { commit: A, tag: 'v1.4.1' }) => ({ follow: 'tags', check: { at, error: '', tag_moved: false, ...check }, deployed })

	it('names the newest tag and the deployed one, or says it is up to date', () => {
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.2', remote_commit: B })))
			.toEqual({ message: 'Newest tag {tag} · deployed {deployed}', params: { tag: 'v1.4.2', deployed: 'v1.4.1' } })
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.1', remote_commit: A })))
			.toEqual({ message: 'Up to date ({tag})', params: { tag: 'v1.4.1' } })
	})

	it('says a tag moved rather than up to date, and names a version deployed from a branch by its commit', () => {
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.1', remote_commit: B, tag_moved: true })))
			.toEqual({ message: 'The tag {tag} moved.', params: { tag: 'v1.4.1' } })
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.2', remote_commit: B }, { commit: A, tag: '' })).params.deployed).toBe('aaaaaaa')
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.2', remote_commit: B }, null)).params.deployed).toBe('-')
	})

	it('gives the check\'s own words when no tag is eligible, and waits for a check made in tags', () => {
		const error = 'no tag matches (pattern `v2.*`, pre-releases excluded)'
		// the check keeps the tag it found before, moved or not: the error wins
		expect(checkSummary(tagApp({ remote_tag: 'v1.4.1', remote_commit: B, tag_moved: true, error })))
			.toEqual({ message: 'The check failed: {error}', params: { error } })
		expect(checkSummary(tagApp({ remote_tag: '', remote_commit: B })).message).toBe('Not checked yet.')
	})

	it('words a branch app as today on a server that knows tags', () => {
		const check = { at, error: '', remote_commit: B, remote_tag: '', tag_moved: false }
		expect(checkSummary({ follow: 'branch', check, new_commits: true, deployed: { commit: A, tag: '' } }))
			.toEqual({ message: 'Commit {commit} is new on the branch.', params: { commit: 'bbbbbbb' } })
		expect(checkSummary({ follow: 'branch', check, new_commits: false, deployed: { commit: B, tag: '' } }))
			.toEqual({ message: 'The branch is at {commit}: up to date.', params: { commit: 'bbbbbbb' } })
	})

	it('names a version by its tag and its commit, or by its commit alone', () => {
		expect(versionName({ commit: A, tag: 'v1.4.1' })).toBe('v1.4.1 (aaaaaaa)')
		expect(versionName({ commit: A, tag: '' })).toBe('aaaaaaa')
		expect(versionName({ commit: A })).toBe('aaaaaaa')
	})

	it.each([
		['v1.4.1', 'v1.4.2', true],
		['v1.4.2', 'v1.4.1', false],
		['v1.9.0', 'v1.10.0', true],
		['1.2.3', 'v1.2.3', false],
		['v2.0.0-rc.1', 'v2.0.0', true],
		['v2.0.0', 'v2.0.0-rc.1', false],
		['v2.0.0-rc.2', 'v2.0.0-rc.10', true],
		['v2.0.0-alpha', 'v2.0.0-alpha.1', true],
		['v2.0.0-1', 'v2.0.0-alpha', true],
		['v2.0.0-beta', 'v2.0.0-alpha', false],
		['v1.2.3+build.9', 'v1.2.3', false],
		['latest', 'v1.0.0', false],
		['v1.0.0', '', false],
	])('%s is older than %s: %s', (tag, than, older) => {
		expect(isOlderTag(tag, than)).toBe(older)
	})

	it('labels the deployed tag, the newest one and the ones the history keeps', () => {
		const C = 'c'.repeat(40)
		const D = 'd'.repeat(40)
		const app = {
			deployed: { commit: A, tag: 'v1.4.1' },
			history: [
				{ commit: A, tag: 'v1.4.1', outcome: 'deployed' },
				{ commit: D, tag: 'v1.3.9', outcome: 'build_failed' },
				{ commit: C, tag: 'v1.4.0', outcome: 'adopted' },
			],
		}
		expect(tagLabels(app, { name: 'v1.4.2', commit: B }, 0)).toEqual(['newest'])
		expect(tagLabels(app, { name: 'v1.4.1', commit: A }, 1)).toEqual(['deployed'])
		expect(tagLabels(app, { name: 'v1.4.0', commit: C }, 2)).toEqual(['in history'])
		// a build that failed never ran: nothing of it is kept
		expect(tagLabels(app, { name: 'v1.3.9', commit: D }, 3)).toEqual([])
		// the deployed tag, moved to another commit, is that commit
		expect(tagLabels(app, { name: 'v1.4.1', commit: B }, 0)).toEqual(['newest'])
		expect(tagLabels({ deployed: null }, { name: 'v1.0.0', commit: A }, 0)).toEqual(['newest'])
	})
})
