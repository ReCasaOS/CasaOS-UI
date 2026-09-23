// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GitAppModal from './GitAppModal.vue'
import i18n from '@/plugins/i18n'

// require.context has no Vite equivalent; an empty table makes $t return its key.
vi.mock('@/assets/lang', () => ({ default: { en_us: {} } }))

const COMMIT = 'c'.repeat(40)
const REPO_URL = 'https://example.com/owner/Jarvis.git'

function gitApp(fields = {}) {
	return {
		app: 'jarvis',
		origin: 'created',
		dir: '/DATA/AppData/jarvis',
		remote: REPO_URL,
		branch: 'main',
		access: 'none',
		token_set: false,
		auto_deploy: false,
		auto_paused: false,
		blocked: false,
		env_tracked: false,
		cloned: false,
		head: null,
		deployed: null,
		check: null,
		new_commits: false,
		state: 'idle',
		operation: null,
		history: [],
		compose: null,
		env_template: null,
		compose_example: null,
		build_log: '',
		...fields,
	}
}

function cloned(fields = {}) {
	return gitApp({
		cloned: true,
		head: { commit: COMMIT, subject: 'first', tracked_files_clean: true },
		compose: {
			files: ['compose.yaml'],
			services: [
				{ name: 'web', build: true, image: '', ports: ['8080:8080'], volumes: ['./data:/data'], sensitive: ['privileged'] },
				{ name: 'db', build: false, image: 'postgres:16', ports: [], volumes: [], sensitive: [] },
			],
		},
		env_template: 'TOKEN=\n',
		...fields,
	})
}

function setup(api = {}) {
	const gitApps = {
		create: vi.fn().mockResolvedValue({ data: { data: gitApp() } }),
		check: vi.fn().mockResolvedValue({ data: { data: cloned() } }),
		deploy: vi.fn().mockResolvedValue({ data: { data: cloned({ state: 'building' }) } }),
		remove: vi.fn().mockResolvedValue({ data: {} }),
		get: vi.fn().mockResolvedValue({ data: { data: cloned() } }),
		...api,
	}
	const reload = vi.fn()
	const wrapper = mount(GitAppModal, {
		global: {
			plugins: [Buefy, i18n],
			mocks: { $api: { gitApps }, $EventBus: { $emit: reload } },
		},
	})
	const button = label => wrapper.findAll('button').find(b => b.text() === label)
	const click = async (label) => {
		await button(label).trigger('click')
		await flushPromises()
	}
	const fire = (event, Properties) => wrapper.vm.$options.sockets[event].call(wrapper.vm, { Properties })
	const inputs = () => wrapper.findAll('input')
	return { wrapper, gitApps, reload, button, click, fire, inputs }
}

describe('gitAppModal repository step', () => {
	it('names the app after the repository until a name is typed', async () => {
		const { wrapper, inputs } = setup()
		await inputs()[0].setValue(REPO_URL)
		expect(inputs()[2].element.value).toBe('jarvis')

		await inputs()[2].setValue('mine')
		await inputs()[0].setValue('https://example.com/owner/other.git')
		expect(inputs()[2].element.value).toBe('mine')
		wrapper.unmount()
	})

	it('registers, clones and reviews a public repository in one go', async () => {
		const { wrapper, gitApps, click, inputs } = setup()
		await inputs()[0].setValue(REPO_URL)
		await click('Next')

		expect(gitApps.create).toHaveBeenCalledWith({ name: 'jarvis', url: REPO_URL, branch: undefined, access: 'none', token: undefined })
		expect(gitApps.check).toHaveBeenCalledWith('jarvis')
		expect(wrapper.text()).toContain('Read from {files}.')
		wrapper.unmount()
	})

	it('sends a token only in token mode', async () => {
		const { wrapper, gitApps, click, inputs } = setup()
		await inputs()[0].setValue(REPO_URL)
		await inputs()[1].setValue('dev')
		await wrapper.findAll('select')[1].setValue('token')
		await inputs()[3].setValue('s3cret')
		await click('Next')

		expect(gitApps.create).toHaveBeenCalledWith({ name: 'jarvis', url: REPO_URL, branch: 'dev', access: 'token', token: 's3cret' })
		wrapper.unmount()
	})

	it('shows the deploy key and clones nothing until the owner continues', async () => {
		const { wrapper, gitApps, click, inputs } = setup({
			create: vi.fn().mockResolvedValue({ data: { data: gitApp({ access: 'key', public_key: 'ssh-ed25519 AAAA casaos-jarvis' }) } }),
		})
		await inputs()[0].setValue(REPO_URL)
		await wrapper.findAll('select')[1].setValue('key')
		await click('Next')

		expect(wrapper.text()).toContain('ssh-ed25519 AAAA casaos-jarvis')
		expect(gitApps.check).not.toHaveBeenCalled()

		await click('Continue')
		expect(gitApps.check).toHaveBeenCalledWith('jarvis')
		wrapper.unmount()
	})

	it('registers an app that follows tags, with its pattern and its pre-releases', async () => {
		const { wrapper, gitApps, click, inputs } = setup({
			create: vi.fn().mockResolvedValue({ data: { data: gitApp({ branch: '', follow: 'tags', tag_pattern: 'v2.*', prereleases: true }) } }),
		})
		await inputs()[0].setValue(REPO_URL)
		await inputs()[1].setValue('dev')
		await wrapper.findAll('select')[0].setValue('tags')
		expect(wrapper.text()).toContain('For example v2.* to stay on version 2; empty for every version tag.')
		expect(wrapper.text()).not.toContain('Empty: the branch the repository names as its default.')

		// the branch field is gone: the pattern comes first, then the checkbox
		await inputs()[1].setValue('v2.*')
		await wrapper.find('input[type="checkbox"]').setValue(true)
		await click('Next')
		expect(gitApps.create).toHaveBeenCalledWith({ name: 'jarvis', url: REPO_URL, follow: 'tags', tag_pattern: 'v2.*', prereleases: true, access: 'none' })
		expect(gitApps.check).toHaveBeenCalledWith('jarvis')
		wrapper.unmount()
	})

	it('takes back an app a server older than tags registered on a branch, and says why', async () => {
		const { wrapper, gitApps, click, inputs } = setup()
		await inputs()[0].setValue(REPO_URL)
		await wrapper.findAll('select')[0].setValue('tags')
		await click('Next')

		expect(gitApps.remove).toHaveBeenCalledWith('jarvis')
		expect(gitApps.check).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('This CasaOS cannot follow tags yet: update it, or follow a branch.')
		// nothing is registered: the form can be changed and sent again
		expect(inputs()[0].attributes('disabled')).toBeUndefined()
		wrapper.unmount()
	})

	it('offers only Cancel when the branch app a server older than tags registered cannot be taken back', async () => {
		const remove = vi.fn()
			.mockRejectedValueOnce({ response: { status: 500, data: { message: 'remove failed' } } })
			.mockResolvedValueOnce({ data: {} })
		const { wrapper, gitApps, button, click, inputs } = setup({ remove })
		await inputs()[0].setValue(REPO_URL)
		await wrapper.findAll('select')[0].setValue('tags')
		await click('Next')

		expect(remove).toHaveBeenCalledWith('jarvis')
		expect(wrapper.text()).toContain('This CasaOS cannot follow tags yet: update it, or follow a branch.')
		expect(button('Continue')).toBeUndefined()
		expect(button('Retry')).toBeUndefined()
		expect(button('Next')).toBeUndefined()
		expect(gitApps.check).not.toHaveBeenCalled()

		// the app is still registered: Cancel deletes it
		await click('Cancel')
		expect(remove).toHaveBeenCalledTimes(2)
		expect(wrapper.emitted('close')).toHaveLength(1)
		wrapper.unmount()
	})

	it('shows what to add when the repository has no compose file, and retries', async () => {
		const example = 'services:\n  app:\n    build: .\n'
		const noCompose = gitApp({ check: { at: '2026-09-16T10:05:00Z', remote_commit: COMMIT, error: 'no compose file at the root' }, compose_example: example })
		const check = vi.fn()
			.mockResolvedValueOnce({ data: { data: noCompose } })
			.mockResolvedValueOnce({ data: { data: cloned() } })
		const { wrapper, click, inputs } = setup({ check })
		await inputs()[0].setValue(REPO_URL)
		await click('Next')

		expect(wrapper.text()).toContain('no compose file at the root')
		expect(wrapper.find('pre').text()).toBe(example.trim())

		await click('Retry')
		expect(check).toHaveBeenCalledTimes(2)
		expect(wrapper.text()).toContain('Read from {files}.')
		wrapper.unmount()
	})

	describe('while the clone runs', () => {
		afterEach(() => vi.useRealTimers())

		it('reads the app until the check has ended, then reviews it', async () => {
			vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
			const checking = gitApp({ operation: { kind: 'check', commit: '', started_at: '2026-09-16T10:05:00Z' } })
			const get = vi.fn().mockResolvedValueOnce({ data: { data: checking } }).mockResolvedValueOnce({ data: { data: cloned() } })
			const { wrapper, gitApps, click, inputs, button } = setup({
				check: vi.fn().mockResolvedValue({ data: { data: checking } }),
				get,
			})
			await inputs()[0].setValue(REPO_URL)
			await click('Next')
			expect(gitApps.check).toHaveBeenCalledWith('jarvis')
			expect(button('Cancel').attributes('disabled')).toBeDefined()
			expect(wrapper.text()).toContain('Cloning the repository…')

			await vi.advanceTimersByTimeAsync(2000)
			expect(get).toHaveBeenCalledTimes(1)
			expect(wrapper.text()).not.toContain('Read from {files}.')

			await vi.advanceTimersByTimeAsync(2000)
			await flushPromises()
			expect(get).toHaveBeenCalledWith('jarvis')
			expect(wrapper.text()).toContain('Read from {files}.')
			expect(wrapper.text()).not.toContain('Cloning the repository…')
			wrapper.unmount()
		})
	})

	it('deletes an app it registered when the owner cancels, and nothing before that', async () => {
		const first = setup()
		await first.click('Cancel')
		expect(first.gitApps.remove).not.toHaveBeenCalled()
		expect(first.wrapper.emitted('close')).toHaveLength(1)
		first.wrapper.unmount()

		const second = setup({
			create: vi.fn().mockResolvedValue({ data: { data: gitApp({ access: 'key', public_key: 'ssh-ed25519 AAAA' }) } }),
		})
		await second.inputs()[0].setValue(REPO_URL)
		await second.wrapper.findAll('select')[1].setValue('key')
		await second.click('Next')
		await second.click('Cancel')
		expect(second.gitApps.remove).toHaveBeenCalledWith('jarvis')
		expect(second.wrapper.emitted('close')).toHaveLength(1)
		second.wrapper.unmount()
	})
})

describe('gitAppModal review step', () => {
	async function reviewed(app = cloned()) {
		const tools = setup({ check: vi.fn().mockResolvedValue({ data: { data: app } }) })
		await tools.inputs()[0].setValue(REPO_URL)
		await tools.click('Next')
		return tools
	}

	it('lists every service, built or pulled, and calls out the sensitive ones', async () => {
		const { wrapper } = await reviewed()
		const services = wrapper.findAll('.git-app__service').map(s => s.text())
		expect(services[0]).toContain('web')
		expect(services[0]).toContain('built from the repository')
		expect(services[0]).toContain('Published ports: {ports}')
		expect(services[1]).toContain('postgres:16')
		expect(wrapper.text()).toContain('web: Privileged mode')
		wrapper.unmount()
	})

	it('prefills .env from the template and deploys with it', async () => {
		const { wrapper, gitApps, click } = await reviewed()
		const editor = wrapper.findComponent({ name: 'CodeMirrorEditor' }).vm.codemirror
		expect(editor.getValue()).toBe('TOKEN=\n')
		expect(editor.getOption('readOnly')).toBe(false)

		editor.setValue('TOKEN=abc\n')
		await click('Deploy')
		expect(gitApps.deploy).toHaveBeenCalledWith('jarvis', { env: 'TOKEN=abc\n' })
		wrapper.unmount()
	})

	it('keeps a tracked .env read-only and does not send it', async () => {
		const { wrapper, gitApps, click } = await reviewed(cloned({ env_tracked: true, env_template: null }))
		expect(wrapper.findComponent({ name: 'CodeMirrorEditor' }).vm.codemirror.getOption('readOnly')).toBe(true)
		expect(wrapper.text()).toContain('The repository tracks its .env file')

		await click('Deploy')
		expect(gitApps.deploy).toHaveBeenCalledWith('jarvis', {})
		wrapper.unmount()
	})
})

describe('gitAppModal deploy step', () => {
	async function deploying(api = {}) {
		const tools = setup(api)
		await tools.inputs()[0].setValue(REPO_URL)
		await tools.click('Next')
		await tools.click('Deploy')
		return tools
	}

	it('follows the build of its own app and says when it is deployed', async () => {
		const { wrapper, fire, reload } = await deploying()
		expect(wrapper.text()).toContain('Building…')

		fire('app:git-build-begin', { 'app:name': 'jarvis' })
		fire('app:git-build-progress', { 'app:name': 'jarvis', 'message': '#1 [web] FROM node:20' })
		fire('app:git-build-progress', { 'app:name': 'other', 'message': 'not ours' })
		fire('app:git-build-end', { 'app:name': 'jarvis' })
		await flushPromises()
		expect(wrapper.find('pre').text()).toBe('#1 [web] FROM node:20')
		expect(wrapper.text()).toContain('Built. Starting the app…')

		fire('app:git-deploy-end', { 'app:name': 'jarvis' })
		await flushPromises()
		expect(wrapper.find('.has-text-success').text()).toBe('Deployed')
		expect(reload).toHaveBeenCalledWith('reloadAppList')
		wrapper.unmount()
	})

	it('keeps a failure that arrives before the answer, and offers to retry or delete', async () => {
		let modal
		const deploy = vi.fn(() => {
			// the build failed at once: its event lands before the 202
			modal.vm.$options.sockets['app:git-build-error'].call(modal.vm, { Properties: { 'app:name': 'jarvis', 'message': 'no Dockerfile' } })
			return Promise.resolve({ data: { data: cloned({ state: 'build_failed' }) } })
		})
		const tools = setup({ deploy })
		modal = tools.wrapper
		await tools.inputs()[0].setValue(REPO_URL)
		await tools.click('Next')
		await tools.click('Deploy')

		expect(modal.text()).toContain('The build failed: {reason}')
		expect(tools.button('Deploy again')).toBeTruthy()

		await tools.click('Delete this app')
		expect(tools.gitApps.remove).toHaveBeenCalledWith('jarvis')
		expect(modal.emitted('close')).toHaveLength(1)
		modal.unmount()
	})

	it('keeps what the last attempt said when deploying again is refused', async () => {
		const deploy = vi.fn()
			.mockResolvedValueOnce({ data: { data: cloned({ state: 'building' }) } })
			.mockRejectedValueOnce({ response: { status: 409, data: { message: 'deploy is running' } } })
		const { wrapper, click, fire } = await deploying({ deploy })
		fire('app:git-build-error', { 'app:name': 'jarvis', 'message': 'no Dockerfile' })
		await flushPromises()

		await click('Deploy again')
		expect(wrapper.text()).toContain('deploy is running')
		expect(wrapper.text()).toContain('The build failed: {reason}')
		wrapper.unmount()
	})

	it('stays open, with what the server said, when deleting the app is refused', async () => {
		const remove = vi.fn().mockRejectedValue({ response: { status: 409, data: { message: 'deploy is running' } } })
		const { wrapper, click, fire } = await deploying({ remove })
		fire('app:git-build-error', { 'app:name': 'jarvis', 'message': 'no Dockerfile' })
		await flushPromises()

		await click('Delete this app')
		expect(remove).toHaveBeenCalledWith('jarvis')
		expect(wrapper.text()).toContain('deploy is running')
		expect(wrapper.emitted('close')).toBeUndefined()
		wrapper.unmount()
	})
})
