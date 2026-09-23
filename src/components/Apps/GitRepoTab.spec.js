// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GitRepoTab from './GitRepoTab.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; a table this small makes $t return its
// key, except for the messages below, which the specs need filled in.
vi.mock('@/assets/lang', () => ({
	default: {
		en_us: Object.fromEntries([
			'Received {when}',
			'The check failed: {error}',
			'Newest tag {tag} · deployed {deployed}',
			'Up to date ({tag})',
			'The tag {tag} now points at another commit: it is not redeployed automatically.',
			'Redeploy {tag}',
		].map(key => [key, key])),
	},
}))

const copy = vi.hoisted(() => vi.fn())
vi.mock('clipboard-copy', () => ({ default: copy }))

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const AT = '2026-09-16T10:00:00Z'

function gitApp(fields = {}) {
	return {
		app: 'jarvis',
		origin: 'created',
		dir: '/DATA/AppData/jarvis',
		remote: 'https://example.com/owner/jarvis.git',
		branch: 'main',
		access: 'none',
		token_set: false,
		auto_deploy: false,
		auto_paused: false,
		blocked: false,
		env_tracked: false,
		cloned: true,
		head: { commit: A, subject: 'feat: voice wake word', tracked_files_clean: true },
		deployed: { commit: A, subject: 'feat: voice wake word', at: AT },
		check: { at: AT, remote_commit: A, error: '' },
		new_commits: false,
		state: 'idle',
		operation: null,
		history: [{ commit: A, subject: 'feat: voice wake word', at: AT, outcome: 'deployed', reason: '', revertable: true }],
		compose: null,
		env_template: null,
		compose_example: null,
		build_log: 'old build\n',
		webhook: { enabled: false, path: '/v2/app_management/git/jarvis/webhook', last_delivery: null },
		...fields,
	}
}

function setup(fields = {}, api = {}) {
	const answer = gitApp(fields)
	const gitApps = {
		get: vi.fn().mockResolvedValue({ data: { data: answer } }),
		update: vi.fn().mockResolvedValue({ data: { data: answer } }),
		check: vi.fn().mockResolvedValue({ data: { data: answer } }),
		deploy: vi.fn().mockResolvedValue({ data: { data: { ...answer, state: 'building' } } }),
		...api,
	}
	const confirm = vi.fn()
	const wrapper = mount(GitRepoTab, {
		props: { appId: 'jarvis', gitApp: answer },
		global: {
			plugins: [Buefy, i18n],
			mocks: { $api: { gitApps }, $buefy: { dialog: { confirm }, toast: { open: vi.fn() } } },
		},
	})
	const button = label => wrapper.findAll('button').find(b => b.text() === label)
	const click = async (label) => {
		await button(label).trigger('click')
		await flushPromises()
	}
	const fire = (event, Properties) => wrapper.vm.$options.sockets[event].call(wrapper.vm, { Properties })
	return { wrapper, gitApps, confirm, button, click, fire }
}

describe('gitRepoTab', () => {
	it('shows the remote, the branch, the deployed commit and the last check', () => {
		const { wrapper } = setup()
		const text = wrapper.text()
		expect(text).toContain('https://example.com/owner/jarvis.git')
		expect(text).toContain('main')
		expect(text).toContain('aaaaaaa')
		expect(text).toContain('feat: voice wake word')
		expect(text).toContain('The branch is at {commit}: up to date.')
		expect(text).not.toContain('Tracked files were modified')
		wrapper.unmount()
	})

	it('says when tracked files were modified in the folder', () => {
		const { wrapper } = setup({ head: { commit: A, subject: 'x', tracked_files_clean: false } })
		expect(wrapper.text()).toContain('Tracked files were modified in the folder.')
		wrapper.unmount()
	})

	it('saves the access mode, with a token only when one is typed', async () => {
		const { wrapper, gitApps, click } = setup({ token_set: true })
		await wrapper.find('select').setValue('token')
		await wrapper.find('input[type="password"]').setValue('s3cret')
		await click('Save')
		expect(gitApps.update).toHaveBeenLastCalledWith('jarvis', { access: 'token', token: 's3cret' })
		expect(wrapper.emitted('change')).toHaveLength(1)
		expect(wrapper.find('input[type="password"]').element.value).toBe('')

		await click('Save')
		expect(gitApps.update).toHaveBeenLastCalledWith('jarvis', { access: 'token' })
		wrapper.unmount()
	})

	it('turns automatic rebuild on, and puts the switch back when the server refuses', async () => {
		const update = vi.fn().mockRejectedValue({ response: { status: 409, data: { message: 'deploy is running' } } })
		const { wrapper } = setup({}, { update })
		await wrapper.find('input[type="checkbox"]').setValue(true)
		await flushPromises()

		expect(update).toHaveBeenCalledWith('jarvis', { auto_deploy: true })
		expect(wrapper.vm.autoDeploy).toBe(false)
		expect(wrapper.text()).toContain('deploy is running')
		expect(wrapper.text()).toContain('It runs whatever is pushed to the branch.')
		wrapper.unmount()
	})

	describe('while a check runs', () => {
		afterEach(() => vi.useRealTimers())

		it('hands up the check as it starts, and the app once the check has ended', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
			const checking = gitApp({ operation: { kind: 'check', commit: '', started_at: AT } })
			const checked = gitApp({ check: { at: AT, remote_commit: B, error: '' }, new_commits: true })
			const get = vi.fn().mockResolvedValue({ data: { data: checked } })
			const { wrapper, button } = setup({}, { check: vi.fn().mockResolvedValue({ data: { data: checking } }), get })

			await button('Test access').trigger('click')
			await flushPromises()
			expect(wrapper.emitted('change')).toEqual([[checking]])
			expect(button('Test access').classes()).toContain('is-loading')

			await vi.advanceTimersByTimeAsync(2000)
			await flushPromises()
			expect(get).toHaveBeenCalledWith('jarvis')
			expect(wrapper.emitted('change').at(-1)).toEqual([checked])
			expect(button('Test access').classes()).not.toContain('is-loading')
			wrapper.unmount()
		})
	})

	it('checks, and deploys the latest commit of the branch', async () => {
		const { wrapper, gitApps, click } = setup({ new_commits: true, check: { at: AT, remote_commit: B, error: '' } })
		expect(wrapper.text()).toContain('Commit {commit} is new on the branch.')

		await click('Check now')
		expect(gitApps.check).toHaveBeenCalledWith('jarvis')

		await click('Fetch and rebuild')
		expect(gitApps.deploy).toHaveBeenCalledWith('jarvis')
		expect(wrapper.emitted('change').at(-1)[0].state).toBe('building')
		wrapper.unmount()
	})

	it('offers a revert to a kept version other than the deployed one, once confirmed', async () => {
		const history = [
			{ commit: A, subject: 'now', at: AT, outcome: 'deployed', reason: '', revertable: true },
			{ commit: B, subject: 'before', at: AT, outcome: 'deployed', reason: '', revertable: true },
			{ commit: C, subject: 'long ago', at: AT, outcome: 'rolled_back', reason: 'web exited with code 1', revertable: false },
		]
		const { wrapper, gitApps, confirm } = setup({ history })
		const reverts = wrapper.findAll('.git-repo-tab__deployment').map(row => row.text().includes('Revert to this version'))
		expect(reverts).toEqual([false, true, false])
		expect(wrapper.text()).toContain('web exited with code 1')

		await wrapper.findAll('button').find(b => b.text() === 'Revert to this version').trigger('click')
		expect(gitApps.deploy).not.toHaveBeenCalled()
		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(gitApps.deploy).toHaveBeenCalledWith('jarvis', { commit: B })
		wrapper.unmount()
	})

	it('follows a build of its own app live, and reads the app again as it moves on', async () => {
		const { wrapper, gitApps, fire } = setup()
		expect(wrapper.find('pre').text()).toBe('old build')

		fire('app:git-build-begin', { 'app:name': 'jarvis' })
		fire('app:git-build-progress', { 'app:name': 'jarvis', 'message': '#1 [web] FROM node:20' })
		fire('app:git-build-progress', { 'app:name': 'other', 'message': 'not ours' })
		await flushPromises()
		expect(wrapper.find('pre').text()).toBe('#1 [web] FROM node:20')

		fire('app:git-deploy-end', { 'app:name': 'other' })
		fire('app:git-deploy-end', { 'app:name': 'jarvis' })
		await flushPromises()
		// once for the begin, once for the end of its own deployment
		expect(gitApps.get).toHaveBeenCalledTimes(2)
		wrapper.unmount()
	})

	it('waits while an operation runs', () => {
		const { wrapper, button } = setup({ operation: { kind: 'build', commit: B, started_at: AT }, state: 'building' })
		expect(button('Check now').attributes('disabled')).toBeDefined()
		expect(wrapper.text()).toContain('Building')
		wrapper.unmount()
	})

	it('changes nothing for an adoptable folder until the owner acts, and cannot adopt one with no remote', async () => {
		const ready = setup({ origin: 'adoptable', deployed: null, history: [] })
		expect(ready.wrapper.text()).toContain('Nothing changes until you act here')
		expect(ready.button('Check now').attributes('disabled')).toBeUndefined()
		// deploying adopts it too
		await ready.click('Fetch and rebuild')
		expect(ready.gitApps.deploy).toHaveBeenCalledWith('jarvis')
		ready.wrapper.unmount()

		const detached = setup({ origin: 'adoptable', remote: '', branch: '', deployed: null, history: [] })
		expect(detached.wrapper.text()).toContain('not on a branch with a remote')
		expect(detached.button('Check now').attributes('disabled')).toBeDefined()
		detached.wrapper.unmount()
	})

	it('shows a stopped automatic rebuild before a paused one', () => {
		const { wrapper } = setup({ blocked: true, auto_paused: true })
		expect(wrapper.text()).toContain('A rollback failed')
		expect(wrapper.text()).not.toContain('Automatic rebuild is paused')
		wrapper.unmount()
	})
})

describe('the webhook of a git app', () => {
	const PATH = '/v2/app_management/git/jarvis/webhook'
	const SECRET = '0123456789abcdef'.repeat(4)
	const on = (fields = {}) => ({ webhook: { enabled: true, path: PATH, secret: SECRET, last_delivery: null, ...fields } })
	const off = { webhook: { enabled: false, path: PATH, last_delivery: null } }
	// the first switch of the tab is automatic rebuild's
	const webhookSwitch = wrapper => wrapper.findAll('input[type="checkbox"]')[1]
	const copyButtons = wrapper => wrapper.findAll('button').filter(b => b.text() === 'Copy')

	afterEach(() => {
		vi.unstubAllGlobals()
		copy.mockClear()
		i18n.global.locale = 'en_us'
	})

	it('turns on at once, and the switch goes back when the server refuses', async () => {
		const { wrapper, gitApps, confirm } = setup()
		expect(wrapper.text()).toContain('A restored app comes back with its webhook off')
		expect(wrapper.text()).not.toContain('How to set it up')

		await webhookSwitch(wrapper).setValue(true)
		await flushPromises()
		expect(confirm).not.toHaveBeenCalled()
		expect(gitApps.update).toHaveBeenCalledWith('jarvis', { webhook_enabled: true })
		expect(wrapper.emitted('change')).toHaveLength(1)
		wrapper.unmount()

		const update = vi.fn().mockRejectedValue({ response: { status: 409, data: { message: 'deploy is running' } } })
		const refused = setup({}, { update })
		await webhookSwitch(refused.wrapper).setValue(true)
		await flushPromises()
		expect(update).toHaveBeenCalledWith('jarvis', { webhook_enabled: true })
		expect(webhookSwitch(refused.wrapper).element.checked).toBe(false)
		expect(refused.wrapper.text()).toContain('deploy is running')
		refused.wrapper.unmount()
	})

	it('shows nothing of a webhook to a server that has none', () => {
		const { wrapper } = setup({ webhook: undefined })
		expect(wrapper.text()).not.toContain('Check on every push')
		expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(1)
		wrapper.unmount()
	})

	it('shows a delivery made while it was open once the owner comes back to the window', async () => {
		const { wrapper, gitApps } = setup(on())
		window.dispatchEvent(new Event('focus'))
		await flushPromises()
		expect(gitApps.get).toHaveBeenCalledWith('jarvis')

		wrapper.unmount()
		gitApps.get.mockClear()
		window.dispatchEvent(new Event('focus'))
		expect(gitApps.get).not.toHaveBeenCalled()
	})

	it('says so when the browser refuses the clipboard', async () => {
		copy.mockRejectedValueOnce(new Error('denied'))
		const { wrapper } = setup(on())
		await copyButtons(wrapper)[0].trigger('click')
		await flushPromises()
		expect(wrapper.vm.$buefy.toast.open).toHaveBeenCalledWith(expect.objectContaining({ message: 'The text could not be copied.', type: 'is-danger' }))
		wrapper.unmount()
	})

	it('builds the URL from the address the dashboard is open at, and copies it', async () => {
		vi.stubGlobal('location', { origin: 'https://casa.example.com' })
		const { wrapper } = setup(on())
		const url = `https://casa.example.com${PATH}`
		expect(wrapper.text()).toContain(url)
		expect(wrapper.text()).toContain('If your forge reaches the box by another address')

		await copyButtons(wrapper)[0].trigger('click')
		expect(copy).toHaveBeenCalledWith(url)
		wrapper.unmount()
	})

	it('keeps the secret hidden until asked, and copies it either way', async () => {
		const { wrapper, click } = setup(on())
		expect(wrapper.text()).not.toContain(SECRET)
		await copyButtons(wrapper)[1].trigger('click')
		expect(copy).toHaveBeenCalledWith(SECRET)

		await click('Show')
		expect(wrapper.text()).toContain(SECRET)
		await click('Hide')
		expect(wrapper.text()).not.toContain(SECRET)
		wrapper.unmount()
	})

	it('regenerates the secret only once confirmed', async () => {
		const { wrapper, gitApps, confirm, click } = setup(on())
		await click('Regenerate')
		expect(gitApps.update).not.toHaveBeenCalled()
		expect(confirm.mock.calls[0][0].message).toBe('The forge is refused from this moment until it is given the new secret.')

		confirm.mock.calls[0][0].onConfirm()
		await flushPromises()
		expect(gitApps.update).toHaveBeenCalledWith('jarvis', { regenerate_webhook_secret: true })
		wrapper.unmount()
	})

	it('turns off only once confirmed, then folds the section', async () => {
		const update = vi.fn().mockResolvedValue({ data: { data: gitApp(off) } })
		const { wrapper, confirm } = setup(on(), { update })

		await webhookSwitch(wrapper).setValue(false)
		expect(update).not.toHaveBeenCalled()
		expect(confirm.mock.calls[0][0].confirmText).toBe('Turn off')
		confirm.mock.calls[0][0].onCancel()
		await flushPromises()
		expect(webhookSwitch(wrapper).element.checked).toBe(true)

		await webhookSwitch(wrapper).setValue(false)
		confirm.mock.calls[1][0].onConfirm()
		await flushPromises()
		expect(update).toHaveBeenCalledWith('jarvis', { webhook_enabled: false })

		// the panel hands the answer back down
		await wrapper.setProps({ gitApp: wrapper.emitted('change').at(-1)[0] })
		expect(wrapper.text()).not.toContain('How to set it up')
		expect(webhookSwitch(wrapper).element.checked).toBe(false)
		wrapper.unmount()
	})

	it('says what the last delivery was, and how long ago', () => {
		const at = new Date(Date.now() - 3 * 60 * 1000).toISOString()
		const github = setup(on({ last_delivery: { at, forge: 'github', event: 'push', result: 'checked' } }))
		expect(github.wrapper.text()).toContain('Received 3 minutes ago · GitHub · push · checked')
		github.wrapper.unmount()

		// a signed request with no event header the server knows
		const unknown = setup(on({ last_delivery: { at, forge: 'unknown', event: '', result: 'queued' } }))
		expect(unknown.wrapper.text()).toContain('Received 3 minutes ago · Unknown forge · queued')
		unknown.wrapper.unmount()

		const none = setup(on())
		expect(none.wrapper.text()).toContain('No delivery yet.')
		expect(none.wrapper.text()).toContain('GitHub sends a ping as the webhook is saved')
		none.wrapper.unmount()

		// a language without the message falls back to English, and so does the time
		i18n.global.locale = 'de_de'
		const german = setup(on({ last_delivery: { at, forge: 'github', event: 'push', result: 'checked' } }))
		expect(german.wrapper.text()).toContain('Received 3 minutes ago · GitHub · push · checked')
		german.wrapper.unmount()
	})

	it('shows how to set it up on GitHub, on Gitea or Forgejo, and on GitLab', async () => {
		const { wrapper } = setup(on())
		await flushPromises()
		expect(wrapper.findAll('.tabs li').map(li => li.text())).toEqual(['GitHub', 'Gitea/Forgejo', 'GitLab'])
		expect(wrapper.text()).toContain('Which events: “Just the push event”.')
		// GitLab sends a tag apart from a push, and only when asked
		expect(wrapper.text()).toContain('Trigger: Push events and Tag push events.')
		wrapper.unmount()
	})
})

describe('a git app that follows tags', () => {
	const release = (commit, tag, fields = {}) => ({ commit, tag, subject: `release ${tag}`, at: AT, outcome: 'deployed', reason: '', revertable: true, ...fields })
	const tagApp = (fields = {}) => ({
		follow: 'tags',
		branch: '',
		tag_pattern: '',
		prereleases: false,
		deployed: { commit: A, tag: 'v1.4.1', subject: 'release v1.4.1', at: AT },
		check: { at: AT, remote_commit: B, remote_tag: 'v1.4.2', tag_moved: false, error: '' },
		new_commits: true,
		history: [release(A, 'v1.4.1')],
		...fields,
	})
	const followRow = wrapper => wrapper.find('.git-repo-tab__follow')
	const saveFollow = wrapper => followRow(wrapper).findAll('button').find(b => b.text() === 'Save')

	it('says which tag is newest and which one runs, and names versions by their tags', () => {
		const behind = setup(tagApp())
		const text = behind.wrapper.text()
		expect(text).toContain('Newest tag v1.4.2 · deployed v1.4.1')
		expect(behind.wrapper.find('.git-repo-tab__deployment').text()).toContain('v1.4.1 (aaaaaaa) release v1.4.1')
		expect(text).toContain('Deploy a newer tag as soon as a check finds it')
		expect(text).toContain('It runs whatever is tagged with a higher version.')
		expect(text).not.toContain('It runs whatever is pushed to the branch.')
		behind.wrapper.unmount()

		const current = setup(tagApp({ check: { at: AT, remote_commit: A, remote_tag: 'v1.4.1', tag_moved: false, error: '' }, new_commits: false }))
		expect(current.wrapper.text()).toContain('Up to date (v1.4.1)')
		current.wrapper.unmount()
	})

	it('gives the check\'s words when no tag is eligible, and nothing of the tag it found before', () => {
		const error = 'no tag matches (pattern `v2.*`, pre-releases excluded)'
		// as the server answers it: the check keeps the tag and the commit it found
		// last, the view still compares them, and the app is at rest (Global Constraints)
		const stale = { at: AT, remote_commit: B, remote_tag: 'v1.4.1', tag_moved: true, error }
		const { wrapper } = setup(tagApp({ tag_pattern: 'v2.*', check: stale, new_commits: false, state: 'idle' }))
		expect(wrapper.text()).toContain(`The check failed: ${error}`)
		expect(wrapper.text()).not.toContain('Newest tag')
		expect(wrapper.text()).not.toContain('Up to date')
		wrapper.unmount()
	})

	it('shows the branch, and nothing of tags, to a server that knows none', () => {
		// the fixture of the specs above has no `follow`, as an older AppManagement answers
		const { wrapper } = setup()
		expect(followRow(wrapper).exists()).toBe(false)
		expect(wrapper.text()).toContain('Branch')
		expect(wrapper.text()).not.toContain('Deploy a tag…')
		expect(wrapper.findAll('select')).toHaveLength(1)
		wrapper.unmount()
	})

	it('switches a branch app to tags with the filter it kept, and says the first deployment is by hand', async () => {
		const { wrapper, gitApps } = setup({ follow: 'branch', tag_pattern: 'v2.*', prereleases: false })
		expect(followRow(wrapper).text()).toContain('main')
		expect(saveFollow(wrapper)).toBeUndefined()
		expect(wrapper.text()).not.toContain('The first deployment in this mode is manual')

		await followRow(wrapper).find('select').setValue('tags')
		expect(followRow(wrapper).find('input.input').element.value).toBe('v2.*')
		await followRow(wrapper).find('input[type="checkbox"]').setValue(true)
		expect(wrapper.text()).toContain('The first deployment in this mode is manual; automatic deployment resumes after it.')

		await saveFollow(wrapper).trigger('click')
		await flushPromises()
		expect(gitApps.update).toHaveBeenCalledWith('jarvis', { follow: 'tags', tag_pattern: 'v2.*', prereleases: true })
		wrapper.unmount()
	})

	it('changes the pattern, and says so until a tag is deployed by hand', async () => {
		const { wrapper, gitApps } = setup(tagApp({ deployed: { commit: A, tag: '', subject: 'feat: voice wake word', at: AT } }))
		expect(wrapper.text()).toContain('The first deployment in this mode is manual')

		await followRow(wrapper).find('input.input').setValue(' v2.* ')
		await saveFollow(wrapper).trigger('click')
		await flushPromises()
		expect(gitApps.update).toHaveBeenCalledWith('jarvis', { follow: 'tags', tag_pattern: 'v2.*', prereleases: false })
		wrapper.unmount()
	})

	it('goes back to a branch, the one typed or the default', async () => {
		const { wrapper, gitApps } = setup(tagApp())
		await followRow(wrapper).find('select').setValue('branch')
		await followRow(wrapper).find('input.input').setValue('dev')
		await saveFollow(wrapper).trigger('click')
		await flushPromises()
		expect(gitApps.update).toHaveBeenLastCalledWith('jarvis', { follow: 'branch', branch: 'dev' })

		await followRow(wrapper).find('select').setValue('branch')
		await saveFollow(wrapper).trigger('click')
		await flushPromises()
		// JSON leaves out a branch left empty: the server takes the remote's default
		expect(JSON.stringify(gitApps.update.mock.lastCall[1])).toBe('{"follow":"branch"}')
		wrapper.unmount()
	})

	it('warns of a tag that moved, and redeploys it only by hand', async () => {
		const moved = { at: AT, remote_commit: B, remote_tag: 'v1.4.1', tag_moved: true, error: '' }
		const { wrapper, gitApps, click } = setup(tagApp({ check: moved, new_commits: false }))
		expect(wrapper.text()).toContain('The tag v1.4.1 now points at another commit: it is not redeployed automatically.')
		expect(wrapper.text()).not.toContain('Up to date')
		expect(gitApps.deploy).not.toHaveBeenCalled()

		await click('Redeploy v1.4.1')
		expect(gitApps.deploy).toHaveBeenCalledWith('jarvis', { tag: 'v1.4.1' })
		wrapper.unmount()
	})

	it('neither warns nor asks on the tag a check kept from before it found none eligible', async () => {
		const error = 'no tag matches (pattern `v2.*`, pre-releases excluded)'
		// the view still compares the tag the check kept: it moved, or it is older
		const moved = setup(tagApp({ check: { at: AT, remote_commit: B, remote_tag: 'v1.4.1', tag_moved: true, error }, new_commits: false }))
		expect(moved.wrapper.text()).not.toContain('now points at another commit')
		expect(moved.button('Redeploy v1.4.1')).toBeUndefined()
		moved.wrapper.unmount()

		const older = setup(tagApp({ check: { at: AT, remote_commit: C, remote_tag: 'v1.4.0', tag_moved: false, error }, new_commits: false }))
		await older.click('Fetch and rebuild')
		expect(older.confirm).not.toHaveBeenCalled()
		expect(older.gitApps.deploy).toHaveBeenCalledWith('jarvis')
		older.wrapper.unmount()
	})

	describe('deploy a tag', () => {
		const LIST = [
			{ name: 'v1.4.2', commit: B },
			{ name: 'v1.4.1', commit: A },
			{ name: 'v1.4.0', commit: C },
		]
		const history = [release(A, 'v1.4.1'), release(C, 'v1.4.0')]
		const listed = () => {
			const tags = vi.fn().mockResolvedValue({ data: { data: LIST } })
			return { tags, ...setup(tagApp({ history }), { tags }) }
		}
		const rows = wrapper => wrapper.findAll('.git-repo-tab__tag')

		it('lists the tags the remote has, with what each one is', async () => {
			const { wrapper, tags, click } = listed()
			await click('Deploy a tag…')
			expect(tags).toHaveBeenCalledWith('jarvis')
			expect(rows(wrapper).map(row => row.findAll('.tag').map(tag => tag.text()))).toEqual([['newest'], ['deployed'], ['in history']])
			expect(rows(wrapper)[0].text()).toContain('v1.4.2 bbbbbbb')
			// nothing to deploy where it already runs
			expect(rows(wrapper).map(row => row.findAll('button').length)).toEqual([1, 0, 1])
			wrapper.unmount()
		})

		it('deploys a newer tag at once, and an older one once confirmed', async () => {
			const { wrapper, gitApps, confirm, click } = listed()
			await click('Deploy a tag…')
			await rows(wrapper)[0].find('button').trigger('click')
			await flushPromises()
			expect(confirm).not.toHaveBeenCalled()
			expect(gitApps.deploy).toHaveBeenLastCalledWith('jarvis', { tag: 'v1.4.2' })
			// the server took it: the list is done with
			expect(rows(wrapper)).toHaveLength(0)

			await click('Deploy a tag…')
			await rows(wrapper)[2].find('button').trigger('click')
			expect(gitApps.deploy).toHaveBeenCalledTimes(1)
			// the server pauses automatic deployment after an older tag: the owner is told first
			expect(confirm.mock.calls[0][0].title).toBe('v1.4.0')
			expect(confirm.mock.calls[0][0].message).toBe('This is an older version than the one deployed; automatic rebuild is paused until you turn it on again or deploy by hand.')
			confirm.mock.calls[0][0].onConfirm()
			await flushPromises()
			expect(gitApps.deploy).toHaveBeenLastCalledWith('jarvis', { tag: 'v1.4.0' })
			wrapper.unmount()
		})

		it('says when there is no tag to deploy, and what the server said when it could not list them', async () => {
			const empty = setup(tagApp(), { tags: vi.fn().mockResolvedValue({ data: { data: [] } }) })
			await empty.click('Deploy a tag…')
			expect(empty.wrapper.text()).toContain('No tag to deploy.')
			empty.wrapper.unmount()

			const refused = setup(tagApp(), { tags: vi.fn().mockRejectedValue({ response: { status: 400, data: { message: 'the app follows a branch' } } }) })
			await refused.click('Deploy a tag…')
			expect(refused.wrapper.text()).toContain('the app follows a branch')
			refused.wrapper.unmount()
		})

		it('asks before Fetch and rebuild goes back to the older newest tag of the last check', async () => {
			const gone = { at: AT, remote_commit: C, remote_tag: 'v1.4.0', tag_moved: false, error: '' }
			const { wrapper, gitApps, confirm, click } = setup(tagApp({ check: gone, new_commits: false }))
			await click('Fetch and rebuild')
			expect(gitApps.deploy).not.toHaveBeenCalled()
			confirm.mock.calls[0][0].onConfirm()
			await flushPromises()
			expect(gitApps.deploy).toHaveBeenCalledWith('jarvis')
			wrapper.unmount()
		})
	})
})
