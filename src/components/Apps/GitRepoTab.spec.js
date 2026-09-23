// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GitRepoTab from './GitRepoTab.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; a table this small makes $t return its
// key, except for the one message the last delivery needs filled in.
vi.mock('@/assets/lang', () => ({ default: { en_us: { 'Received {when}': 'Received {when}' } } }))

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
		wrapper.unmount()
	})
})
