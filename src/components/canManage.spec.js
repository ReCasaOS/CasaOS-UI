// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TopBar from './TopBar.vue'
import AppSection from '@/components/Apps/AppSection.vue'
import AppPanel from '@/components/Apps/AppPanel.vue'
import getters from '@/store/getters'
import createEventBus from '@/events/eventBus'

vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))
vi.mock('@/assets/lang', () => ({ default: { en_us: { lang_name: 'English' } } }))
vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(() => new Promise(() => {})) } }))
vi.mock('@/components/Logs/entry', async importOriginal => ({ ...await importOriginal(), hasLogs: vi.fn(() => Promise.resolve(false)), logsApplication: () => ({ name: 'logs' }) }))
vi.mock('@/components/Fleet/entry', async importOriginal => ({ ...await importOriginal(), hasFleet: vi.fn(() => Promise.resolve(false)), fleetApplication: () => ({ name: 'Fleet' }) }))
vi.mock('@/components/VirtualMachines/entry', async importOriginal => ({
	...await importOriginal(),
	hasVirtualMachines: vi.fn(() => Promise.resolve(false)),
	listVirtualMachines: vi.fn(() => Promise.resolve([])),
	vmApplication: () => ({ name: 'Virtual Machines' }),
}))
vi.mock('@/service/logs', () => ({ logsApi: {} }))

const never = () => new Promise(() => {})
const never$ = new Proxy({}, { get: () => never })
function store(role) {
	const state = { isMobile: false, sidebarOpen: false, notImportList: [], appLaunchInIframe: false, user: { id: 1, username: 'tester', role }, hardwareInfo: { mem: { total: 1 } } }
	return { state, commit: () => {}, getters: { isAdmin: getters.isAdmin(state), canWrite: getters.canWrite(state), canReadModule: getters.canReadModule(state) } }
}
const pending = (...names) => Object.fromEntries(names.map(n => [n, never$]))

let wrapper
afterEach(() => {
	wrapper?.unmount()
	document.body.innerHTML = ''
})

describe('the top bar for an account that cannot manage the box', () => {
	function bar(role) {
		wrapper = mount(TopBar, {
			attachTo: document.body,
			props: { initBarData: { lang: 'en_us', search_engine: 'https://duckduckgo.com/?q=', search_switch: true, recommend_switch: true, existing_apps_switch: true } },
			global: {
				plugins: [Buefy],
				stubs: { AccountPanel: { template: '<div class="account-panel">Log out Change password</div>' } },
				mocks: {
					$t: key => key,
					$te: () => true,
					$i18n: { locale: 'en_us' },
					$api: { sys: never$, users: never$, ...pending('container', 'sync') },
					$EventBus: createEventBus(),
					$messageBus: () => {},
					$buefy: { modal: { open: vi.fn() }, toast: { open: vi.fn() } },
					$store: store(role),
				},
			},
		})
		return flushPromises()
	}
	const text = () => document.body.textContent
	const managing = ['WebUI Port', 'Backup destinations', 'Docker data', 'Share accounts', 'Current version', 'System packages', 'New login page (beta)', 'Restart', 'Shutdown', 'Open the Terminal full screen']

	it('hides the System and Updates columns, the power footer, the login-page row and the terminal icon for a user', async () => {
		await bar('user')
		for (const label of managing)
			expect(text(), label).not.toContain(label)
		expect(document.body.querySelector('.mdi-console, [icon="terminal-outline"], .casa-terminal-outline')).toBeNull()
		// the display settings and the account's own entry stay
		expect(text()).toContain('Show Search Bar')
		expect(text()).toContain('Log out')
		expect(text()).not.toContain('Accounts')
	})

	it.each(['', undefined])('shows none of them while the role is unknown (%j)', async (role) => {
		await bar(role)
		for (const label of managing)
			expect(text(), label).not.toContain(label)
		expect(document.body.querySelector('.mdi-console, [icon="terminal-outline"], .casa-terminal-outline')).toBeNull()
		expect(text()).not.toContain('Accounts')
	})

	it.each(['admin'])('shows them for the role %j', async (role) => {
		await bar(role)
		for (const label of managing)
			expect(text(), label).toContain(label)
		expect(wrapper.html()).toContain('terminal-outline')
	})
})

describe('the app section', () => {
	function section(role) {
		wrapper = shallowMount(AppSection, {
			global: {
				plugins: [Buefy],
				renderStubDefaultSlot: true,
				mocks: {
					$t: key => key,
					$messageBus: () => {},
					$EventBus: createEventBus(),
					$api: { container: never$, apps: never$, users: never$, sys: never$ },
					$openAPI: never$,
					$store: store(role),
				},
			},
		})
		return flushPromises()
	}

	it('has no "+" menu (install, git, external link, update all) for a user', async () => {
		await section('user')
		expect(wrapper.text()).not.toContain('Custom Install APP')
		expect(wrapper.text()).not.toContain('Update every app')
	})

	it('has it for the admin', async () => {
		await section('admin')
		expect(wrapper.text()).toContain('Custom Install APP')
		expect(wrapper.text()).toContain('Update every app')
	})
})

describe('the app store panel', () => {
	function panel(role, props = {}) {
		wrapper = shallowMount(AppPanel, {
			props: { id: 'jarvis', state: 'update', isCasa: true, runningStatus: 'running', configData: { memory: { total: 1 }, networks: [] }, settingComposeData: 'name: jarvis\nservices:\n  web:\n    image: nginx\n', ...props },
			global: {
				plugins: [Buefy],
				renderStubDefaultSlot: true,
				directives: { 'dompurify-html': {} },
				mocks: {
					$t: key => key,
					$messageBus: () => {},
					$store: store(role),
					$api: { gitApps: { get: never }, sys: { hardwareInfo: never }, container: { getComposeEnv: never } },
					$openAPI: { appManagement: { appStore: { composeAppStoreInfoList: never } } },
				},
			},
		})
		return flushPromises()
	}

	it('has no terminal button on an installed app for a user, and has it for the admin', async () => {
		await panel('user', { currentSlide: 1 })
		expect(wrapper.find('.mdi-console').exists()).toBe(false)
		wrapper.unmount()
		await panel('admin', { currentSlide: 1 })
		expect(wrapper.find('.mdi-console').exists()).toBe(true)
	})

	it('has no Custom Install button for a user', async () => {
		await panel('admin', { state: 'install' })
		await wrapper.setData({ currentSlide: 0 })
		expect(wrapper.find('b-button-stub[label="Custom Install"]').exists()).toBe(true)
		wrapper.unmount()
		await panel('user', { state: 'install' })
		await wrapper.setData({ currentSlide: 0 })
		expect(wrapper.find('b-button-stub[label="Custom Install"]').exists()).toBe(false)
	})
})

describe('the role fetch of the top bar', () => {
	it('is tried once more after a failure', async () => {
		vi.useFakeTimers()
		const getUserInfo = vi.fn().mockRejectedValue(new Error('offline'))
		const vm = { userRetried: false, userInfo: null, $api: { users: { getUserInfo } }, $store: { state: { user: { id: 0 } }, commit: vi.fn() } }
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vm.getUserInfo = TopBar.methods.getUserInfo
		await vm.getUserInfo()
		await vi.advanceTimersByTimeAsync(3000)
		await vi.advanceTimersByTimeAsync(3000)
		expect(getUserInfo).toHaveBeenCalledTimes(2)
		// the second failure ends the wait of what waits for the role (the Accounts screen)
		expect(vm.$store.commit).toHaveBeenCalledWith('SET_ROLE_UNCONFIRMED')
		vi.useRealTimers()
	})
})
