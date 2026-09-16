// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppPanel from './AppPanel.vue'
import ComposeConfig from './ComposeConfig.vue'
import ComposeEditor from './ComposeEditor.vue'
import EnvEditor from './EnvEditor.vue'
import GitRepoTab from './GitRepoTab.vue'

// lottie-web paints into a canvas the moment it is imported and happy-dom has no
// 2d context, so the import itself throws.
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

const COMPOSE = 'name: jarvis\nservices:\n  web:\n    image: nginx\n'

// The settings panel of an installed app, as AppSection opens it. Every other
// request it makes on its way up never settles: they are not what is under test.
async function panel(answer, props = {}) {
	const pending = () => new Promise(() => {})
	const get = answer instanceof Error ? vi.fn().mockRejectedValue(answer) : vi.fn().mockResolvedValue({ data: { data: answer } })
	const wrapper = shallowMount(AppPanel, {
		props: {
			id: 'jarvis',
			state: 'update',
			isCasa: true,
			runningStatus: 'running',
			configData: { memory: { total: 4 * 1024 * 1024 * 1024 }, networks: [] },
			settingComposeData: COMPOSE,
			...props,
		},
		global: {
			plugins: [Buefy],
			// the install progress is rendered through it, and nothing here installs
			directives: { 'dompurify-html': {} },
			mocks: {
				$t: key => key,
				$messageBus: () => {},
				$store: { state: { isMobile: false } },
				$api: { gitApps: { get }, sys: { hardwareInfo: pending }, container: { getComposeEnv: () => Promise.resolve({ data: 'A=1\n' }) } },
				$openAPI: { appManagement: { appStore: { composeAppStoreInfoList: pending } } },
			},
		},
	})
	await flushPromises()
	return { wrapper, get }
}

// v-show, read off the element: isVisible() needs a wrapper attached to a document
function shown(component) {
	return component.element.style.display !== 'none'
}

function gitApp(fields = {}) {
	return { app: 'jarvis', origin: 'created', remote: 'https://example.com/jarvis.git', branch: 'main', env_tracked: false, history: [], ...fields }
}

describe('appPanel of a git app', () => {
	it('asks once whether the app is a git app, and adds no tab when it is not', async () => {
		const { wrapper, get } = await panel(Object.assign(new Error('404'), { response: { status: 404 } }))
		expect(get).toHaveBeenCalledWith('jarvis')
		expect(wrapper.vm.gitApp).toBeNull()
		expect(wrapper.find('.git-notice').exists()).toBe(false)
		expect(shown(wrapper.findComponent(ComposeConfig))).toBe(true)
		wrapper.unmount()
	})

	it('points Settings and Compose of a git app to its repository', async () => {
		const { wrapper } = await panel(gitApp())
		expect(wrapper.find('.git-notice').exists()).toBe(true)
		// kept mounted and hidden: it names the service the terminal opens on
		expect(wrapper.findComponent(ComposeConfig).exists()).toBe(true)
		expect(shown(wrapper.findComponent(ComposeConfig))).toBe(false)

		await wrapper.setData({ editorTab: 'compose' })
		expect(wrapper.find('.git-notice').exists()).toBe(true)
		expect(wrapper.findComponent(ComposeEditor).exists()).toBe(false)

		await wrapper.setData({ editorTab: 'repository' })
		expect(wrapper.findComponent(GitRepoTab).props('gitApp').app).toBe('jarvis')
		wrapper.unmount()
	})

	it('takes the app the Repository tab hands back', async () => {
		const { wrapper } = await panel(gitApp({ origin: 'adoptable' }))
		await wrapper.setData({ editorTab: 'repository' })
		wrapper.findComponent(GitRepoTab).vm.$emit('change', gitApp({ origin: 'adopted', env_tracked: true }))
		await flushPromises()
		expect(wrapper.findComponent(GitRepoTab).props('gitApp').origin).toBe('adopted')
		expect(wrapper.vm.envTracked).toBe(true)
		wrapper.unmount()
	})

	it('keeps .env editable unless the repository tracks it', async () => {
		const editable = await panel(gitApp())
		await editable.wrapper.setData({ editorTab: 'env', envLoaded: true })
		expect(editable.wrapper.find('.git-notice').exists()).toBe(false)
		expect(editable.wrapper.findComponent(EnvEditor).props('readonly')).toBe(false)
		editable.wrapper.unmount()

		const tracked = await panel(gitApp({ env_tracked: true }))
		await tracked.wrapper.setData({ editorTab: 'env', envLoaded: true })
		expect(tracked.wrapper.find('.git-notice').exists()).toBe(true)
		expect(tracked.wrapper.findComponent(EnvEditor).props('readonly')).toBe(true)
		tracked.wrapper.unmount()
	})

	it('points an adoptable app to its repository too', async () => {
		const { wrapper } = await panel(gitApp({ origin: 'adoptable', env_tracked: true }))
		expect(wrapper.find('.git-notice').exists()).toBe(true)
		expect(shown(wrapper.findComponent(ComposeConfig))).toBe(false)

		await wrapper.setData({ editorTab: 'env', envLoaded: true })
		expect(wrapper.find('.git-notice').exists()).toBe(true)
		expect(wrapper.findComponent(EnvEditor).props('readonly')).toBe(true)
		wrapper.unmount()
	})

	it('is the Repository tab alone for a git app with no container', async () => {
		const { wrapper, get } = await panel(gitApp({ state: 'build_failed' }), { settingComposeData: '', runningStatus: '', repositoryOnly: true })
		expect(get).toHaveBeenCalledWith('jarvis')
		expect(wrapper.find('.compose-mode-switch').exists()).toBe(false)
		expect(wrapper.find('.git-notice').exists()).toBe(false)
		expect(wrapper.findComponent(ComposeConfig).exists()).toBe(false)
		expect(wrapper.findComponent(GitRepoTab).exists()).toBe(true)
		expect(wrapper.vm.panelTitle).toBe('jarvis Setting')
		expect(wrapper.vm.showExportButton).toBe(false)
		wrapper.unmount()
	})
})
