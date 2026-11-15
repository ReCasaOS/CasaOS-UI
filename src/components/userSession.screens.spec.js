// @vitest-environment happy-dom
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContainerDetailPanel from './Apps/ContainerDetailPanel.vue'
import { anItem } from './Stats/__fixtures__/contract'
import StatsPage from './Stats/StatsPage.vue'
import WallpaperModal from './wallpaper/WallpaperModal.vue'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'
import { statsApi } from '@/service/stats'
import i18n from '@/plugins/i18n'

// The screens an account of role user can still open: what they show and ask of the box.
vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default } }))
vi.mock('simple-uploader.js', () => ({ default: class {} }))
vi.mock('@/components/wallpaper/loginWallpaper', async original => ({ ...(await original()), findLoginWallpaper: vi.fn(() => Promise.resolve('')) }))
vi.mock('@/service/stats', () => ({
	STATS_SOURCES: ['app_management', 'virt_management', 'core'],
	statsApi: { list: vi.fn(), series: vi.fn(), alerts: vi.fn(), setAlerts: vi.fn() },
}))
vi.mock('@/components/VirtualMachines/entry', () => ({ hasVirtualMachines: vi.fn() }))
vi.mock('vue3-apexcharts', () => ({ default: { name: 'ApexStub', render: () => null } }))

const plain = { getters: { canWrite: false, canReadModule: () => false } }
const owner = { getters: { canWrite: true, canReadModule: () => true } }

describe('statistics as an account of role user', () => {
	beforeEach(() => {
		document.body.innerHTML = ''
		vi.clearAllMocks()
		hasVirtualMachines.mockResolvedValue(true)
		statsApi.series.mockReturnValue(new Promise(() => {}))
		statsApi.list.mockImplementation(source => Promise.resolve({ items: source === 'app_management' ? [anItem()] : [], notes: [] }))
	})

	const mountPage = store => mount(StatsPage, { attachTo: document.body, global: { plugins: [Buefy, i18n], mocks: { $store: store } } })
	const alertButton = () => [...document.querySelectorAll('.stats-head button')].find(b => b.textContent.trim() === 'Alert settings')

	it('asks for the apps only, and offers no Alert settings', async () => {
		mountPage(plain)
		await flushPromises()

		expect(statsApi.list.mock.calls.map(call => call[0])).toEqual(['app_management'])
		expect(alertButton()).toBeUndefined()
	})

	it('asks the owner for all three and offers the Alert settings', async () => {
		mountPage(owner)
		await flushPromises()

		expect(statsApi.list.mock.calls.map(call => call[0]).sort()).toEqual(['app_management', 'core', 'virt_management'])
		expect(alertButton()).toBeDefined()
	})
})

describe('the container detail as an account of role user', () => {
	const detail = { id: 'abc', name: 'web', image: 'nginx' }
	const mountPanel = store => mount(ContainerDetailPanel, {
		props: { containerId: 'abc' },
		global: { plugins: [Buefy, i18n], mocks: { $store: store, $api: { container: { getDetail: vi.fn(() => Promise.resolve({ data: { data: detail } })) } } } },
	})

	it('has no Remove button', async () => {
		const wrapper = mountPanel(plain)
		await flushPromises()

		expect(wrapper.text()).not.toContain('Remove')
		expect(wrapper.text()).toContain('Close')
	})

	it('has one for the owner', async () => {
		const wrapper = mountPanel(owner)
		await flushPromises()

		expect(wrapper.text()).toContain('Remove')
	})
})

describe('the wallpaper upload as an account of role user', () => {
	it('renews the account\'s token with its own call and never asks for the box\'s version', async () => {
		const handlers = {}
		const upload = vi.fn()
		const vm = {
			uploader: { opts: { headers: {} }, assignBrowse: vi.fn(), on: (name, fn) => { handlers[name] = fn }, upload },
			isUpLoading: false,
			attributes: {},
			onLoginProbed: vi.fn(),
			$store: { state: { access_token: 'tok' } },
			$api: { users: { getUserInfo: vi.fn(() => Promise.resolve({})) }, sys: { getVersion: vi.fn() } },
			$buefy: { toast: { open: vi.fn() } },
			$t: s => s,
		}
		WallpaperModal.mounted.call(vm)
		handlers.filesSubmitted()
		await flushPromises()

		expect(vm.$api.users.getUserInfo).toHaveBeenCalledTimes(1)
		expect(vm.$api.sys.getVersion).not.toHaveBeenCalled()
		expect(upload).toHaveBeenCalledTimes(1)
		expect(vm.uploader.opts.headers.Authorization).toBe('tok')
	})
})
