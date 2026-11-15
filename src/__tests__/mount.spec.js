// @vitest-environment happy-dom
import Buefy from 'buefy'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import { h } from 'vue'
import { config, shallowMount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import VAnimateCss from '@/plugins/animate-css'
import createEventBus from '@/events/eventBus'

/**
 * Smoke tests: every component below must mount without throwing and without
 * emitting a single Vue warning. They deliberately assert nothing about markup
 * or behaviour, so that the Vue 3 / Buefy 3 swap can keep them unchanged and
 * still get a loud failure the moment a component stops booting.
 */

// The locale table is assembled with webpack's `require.context`, which Vite has
// no equivalent for. $t is mocked below, so an empty table changes nothing here.
vi.mock('@/assets/lang', () => ({ default: { en_us: { lang_name: 'English' } } }))

// lottie-web paints into a canvas the moment it is imported and happy-dom has
// no 2d context, so the import itself throws. shallowMount stubs the tag anyway.
// the HTTP client reads its sentences from the i18n plugin, which says so on the console when it is created
vi.mock('@/plugins/i18n', () => ({ default: { global: { t: key => key } } }))
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))

const App = () => import('@/App.vue')
const TopBar = () => import('@/components/TopBar.vue')
const BrandBar = () => import('@/components/BrandBar.vue')
const ContactBar = () => import('@/components/ContactBar.vue')
const SearchBar = () => import('@/components/SearchBar.vue')
const AppCard = () => import('@/components/Apps/AppCard.vue')
const AppSideBar = () => import('@/components/Apps/AppSideBar.vue')
const UpdateModal = () => import('@/components/settings/UpdateModal.vue')
const Ports = () => import('@/components/forms/Ports.vue')
const Login = () => import('@/views/Login.vue')
const CoreService = () => import('@/components/CoreService.vue')
const Clock = () => import('@/widgets/Clock.vue')
const Network = () => import('@/widgets/Network.vue')
const ListView = () => import('@/components/filebrowser/components/ListView.vue')

// The other components that register an async child. shallowMount stubs those
// children, so what this guards is the registry itself: the vue import resolving
// and every wrapped factory surviving option evaluation.
// Two owners are deliberately absent. Home pulls SideBar -> Settings.vue, which
// builds its widget table with webpack's require.context (see the note above);
// AppPanel's mounted() focuses $refs.search_app.$el.children[0], which a stubbed
// child cannot supply. Both need more scaffolding than the registry is worth.
const FilePanel = () => import('@/components/filebrowser/FilePanel.vue')
const DropPage = () => import('@/components/filebrowser/drop/DropPage.vue')
const ShareListPage = () => import('@/components/filebrowser/shared/ShareListPage.vue')
const CasaWallpaper = () => import('@/components/wallpaper/CasaWallpaper.vue')
const StorageManagerPanel = () => import('@/components/Storage/StorageManagerPanel.vue')

// The forms vee-validate 4 was rolled out across. Their <VeeForm> and <VeeField>
// are stubbed here like any other child, so what this guards is that the module
// still resolves and the options still evaluate - which is what broke while the
// tags and the package were out of step. Two forms stay out for the same
// mounted() reason as the components above: AppPanel focuses
// $refs.search_app, ExternalLinkPanel focuses $refs.inputs, and both refs sit
// on a child that a stub cannot supply - here, one two slots deep inside the
// stubbed VeeForm and VeeField.
const AccountPanel = () => import('@/components/account/AccountPanel.vue')
const ComposeConfig = () => import('@/components/Apps/ComposeConfig.vue')
const Welcome = () => import('@/views/Welcome.vue')

// Every $api / $openAPI call returns a promise that never settles: the network
// is not what these tests are about, and a fake payload would only feed each
// component a shape it does not expect.
const apiHandler = {
	get: () => new Proxy(() => {}, apiHandler),
	apply: () => new Promise(() => {}),
}
const $api = new Proxy(() => {}, apiHandler)

// The slice of the vue-simple-uploader instance FilePanel drives.
const uploaderStub = { assignDrop() {}, on() {}, off() {}, cancel() {} }

const state = {
	isMobile: false,
	sidebarOpen: false,
	siteLoading: false,
	needInitialization: false,
	existingAppsSwitch: true,
	recommendSwitch: true,
	searchEngine: 'google',
	searchEngineSwitch: true,
	appLaunchInIframe: false,
	appLaunchExceptions: [],
	hardwareInfo: { cpu: { num: 1, percent: 0 }, mem: { total: 1, used: 0 }, net: [], disk: {} },
	user: { username: 'tester', avatar: '', role: 'admin' },
	currentPath: '/',
	isViewGird: true,
	operateObject: null,
	networkStorage: [],
	shortcutData: [],
	notImportList: [],
	wallpaperObject: { path: '', from: 'Built-in' },
}

const mocks = {
	$t: key => key,
	$tc: key => key,
	$te: () => true,
	$i18n: { locale: 'en_us', t: key => key },
	$api,
	$openAPI: $api,
	$EventBus: createEventBus(),
	$messageBus: Object.assign(() => {}, { on: () => {}, off: () => {}, emit: () => {} }),
	$baseIp: '127.0.0.1',
	$baseURL: '127.0.0.1',
	$protocol: 'http:',
	$wsProtocol: 'ws:',
	$route: { path: '/', name: 'home', params: {}, query: {}, meta: {} },
	$router: { push: () => {}, replace: () => {} },
	$store: { state, getters: { canWrite: true, canReadModule: () => true }, commit: () => {}, dispatch: () => Promise.resolve() },
}

let problems = []

beforeAll(() => {
	// Mirrors the plugin stack main.js installs, minus the ones that need a live
	// socket; a plugin that stops loading is exactly what should fail here.
	// @vue/test-utils 2 builds a fresh app per mount, so plugins and app-level
	// config are declared on config.global rather than on a Vue singleton.
	config.global.plugins = [Buefy, VueDOMPurifyHTML, VAnimateCss]
	config.global.config.warnHandler = msg => problems.push(msg)
})

beforeEach(() => {
	problems = []
})

async function mountOk(load, { mocks: extra = {}, stubs = {}, provide = {}, ...rest } = {}) {
	// warnHandler only ever sees a warning raised against a mounted app. One
	// raised at import time has no current instance and goes to console.warn
	// instead, so without this spy a test can pass while sitting on a pile of
	// them. Same array, same assertion.
	const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
		problems.push(args.map(String).join(' '))
	})
	try {
		const { default: Component } = await load()
		// test-utils 2 moved mocks / stubs / provide under `global`; slots, propsData
		// and attachTo stay top level. vue-router 4 registers its components as
		// RouterView / RouterLink, so the kebab stub key no longer matches.
		const wrapper = shallowMount(Component, {
			global: {
				mocks: { ...mocks, ...extra },
				stubs: { RouterView: true, RouterLink: true, ...stubs },
				provide,
			},
			...rest,
		})
		await wrapper.vm.$nextTick()
		await wrapper.vm.$nextTick()
		expect(wrapper.element).toBeTruthy()
		expect(problems).toEqual([])
		wrapper.unmount()
	} finally {
		warnSpy.mockRestore()
	}
}

describe('component smoke tests', () => {
	it('mounts App', () => mountOk(App))
	it('mounts TopBar', () => mountOk(TopBar, {
		propsData: { initBarData: { lang: 'en_us', search_engine: 'https://duckduckgo.com/?q=', search_switch: true, recommend_switch: true, existing_apps_switch: true } },
	}))
	it('mounts BrandBar', () => mountOk(BrandBar))
	it('mounts ContactBar', () => mountOk(ContactBar))
	it('mounts SearchBar', () => mountOk(SearchBar))
	it('mounts AppCard', () => mountOk(AppCard, {
		propsData: { item: { id: '1', name: 'Test', title: { en_us: 'Test' }, icon: '', status: 'running', app_type: 'system', index: '', port_map: '', host: '', protocol: 'http' } },
		provide: { homeShowFiles: () => {}, openAppStore: () => {} },
	}))
	// Open, with slot content: closed and empty it renders one hidden div and
	// the test would only prove the SFC parsed.
	it('mounts AppSideBar', () => mountOk(AppSideBar, {
		propsData: { open: true },
		slots: { default: '<p>panel</p>' },
	}))
	it('mounts UpdateModal', () => mountOk(UpdateModal, { propsData: { changeLog: '# hi' } }))
	it('mounts Ports', () => mountOk(Ports, { propsData: { modelValue: [], showHostPost: true } }))
	it('mounts Login', () => mountOk(Login))
	// The one Home child that carries the carousel. shallowMount stubs the
	// Swiper tags, so what this guards is the swiper/vue import resolving
	// against this Vue: the previous carousel threw at import in the bundle.
	it('mounts CoreService', () => mountOk(CoreService, { provide: { homeShowFiles: () => {} } }))
	it('mounts Clock', () => mountOk(Clock))
	it('mounts Network', () => mountOk(Network))
	it('mounts ListView', () => mountOk(ListView, { propsData: { listData: [] }, attachTo: document.body }))

	// mounted() reaches into $refs.uploader.uploader for the vue-simple-uploader
	// handle, which a bare stub does not carry.
	it('mounts FilePanel', () => mountOk(FilePanel, {
		stubs: { Uploader: { render: () => h('div'), data: () => ({ uploader: uploaderStub }) } },
	}))
	// mounted() measures .action-area, which lives in this component's own template.
	// beforeUnmount() tears down a peer manager that mounted() only builds a second
	// later, so this case is also what proves that teardown is guarded.
	it('mounts DropPage', () => mountOk(DropPage, {
		attachTo: document.body,
	}))
	it('mounts ShareListPage', () => mountOk(ShareListPage))
	it('mounts CasaWallpaper', () => mountOk(CasaWallpaper))
	it('mounts StorageManagerPanel', () => mountOk(StorageManagerPanel))
	it('mounts AccountPanel', () => mountOk(AccountPanel))
	it('mounts ComposeConfig', () => mountOk(ComposeConfig, {
		propsData: { totalMemory: 1, networks: [], capArray: [] },
	}))
	it('mounts Welcome', () => mountOk(Welcome))
})
