// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Buefy from 'buefy'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Gateway is closed to an account of role `user` except for the calls of its table (ui-calls.txt, in the Gateway's worktree beside
// this one). This mounts the dashboard as such an account, on the real store and the real HTTP client, and requires every call it
// makes to be in that table.

vi.mock('@/assets/lang', async () => ({ default: { en_us: (await import('@/assets/lang/en_US.json')).default, fr_fr: (await import('@/assets/lang/fr_FR.json')).default } }))
vi.mock('lottie-web-vue', () => ({ default: { name: 'lottie-animation', template: '<div/>' } }))
vi.mock('@/router', () => ({ default: { replace: vi.fn(), push: vi.fn(), resolve: () => ({ href: '#' }) } }))
vi.mock('@/components/filebrowser/FilePanel.vue', () => ({ default: { name: 'FilePanel', template: '<div class="file-panel" />' } }))

const sockets = vi.hoisted(() => ({ io: vi.fn(), opened: vi.fn() }))
vi.mock('socket.io-client', () => ({
	default: (...args) => {
		sockets.io(...args)
		return { io: { on() {}, opts: {} }, on() {}, off() {}, close() {}, open: sockets.opened }
	},
}))

// the list lives in CasaOS-Gateway; this repo keeps a committed copy, so the check runs wherever only this repo is checked out.
// The Gateway is looked for beside this repo, or where ACCOUNTS_PROOF_GATEWAY_REPO says (as dev/accounts-proof/run.sh of CasaOS does)
const TABLE = resolve(process.cwd(), 'src', 'views', 'testdata', 'ui-calls.txt')
const GATEWAY_TABLE = resolve(process.env.ACCOUNTS_PROOF_GATEWAY_REPO || resolve(process.cwd(), '..', 'CasaOS-Gateway'), 'route', 'testdata', 'ui-calls.txt')
const hasGateway = existsSync(GATEWAY_TABLE)

// "METHOD /path kind" per line: the lines a session with these rights may call, public, base and module:<right> for each of
// its rights. The example app names and VM id of the table stand for any.
function allowed(rights = []) {
	return readFileSync(TABLE, 'utf8')
		.split('\n')
		.map(line => line.trim().split(/\s+/))
		.filter(([method, , kind]) => method && !method.startsWith('#') && (kind === 'public' || kind === 'base' || rights.some(right => kind === `module:${right}`)))
		.map(([method, path]) => new RegExp(`^${method} ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/immich|vm1/g, '[^/]+')}$`))
}

// the account has chosen the new dashboard, whose health strip reads the modules
let beta = false
// the rights the server answers, when they are not those stored at sign-in
let serverRights = null
// the box's load the utilization answers
let cpuPercent = 0

const reply = (data = {}) => ({ success: 200, message: 'ok', data })
function answerFor(method, path) {
	if (path === '/v1/users/current/custom/system')
		return reply({ lang: 'en_us', search_engine: 'https://duckduckgo.com/?q=', search_switch: true, recommend_switch: true, existing_apps_switch: true, dashboard_beta: beta })
	if (path === '/v2/app_management/web/appgrid')
		return reply([{ name: 'immich', app_type: 'v2app', status: 'running', title: { en_us: 'Immich' }, icon: '', port: '2283', hostname: '' }])
	if (path === '/v1/users/current/custom/widgets_config')
		return reply([])
	if (path.startsWith('/v1/users/current/custom/'))
		return reply({ data: [] })
	if (path === '/v2/users/events')
		return []
	if (path === '/v2/app_management/backup/runs')
		return reply([])
	if (path === '/v1/sys/utilization')
		return reply({ cpu: { num: 1, percent: cpuPercent, power: {}, temperature: 0 }, mem: { total: 1, used: 0, usedPercent: 0 }, net: [], sys_disk: {}, sys_usb: [] })
	if (path === '/v1/container/usage')
		return reply([])
	if (path === '/v1/sys/hardware')
		return reply({ drive_model: 'box', arch: 'amd64' })
	if (path === '/v1/users/current') {
		const stored = JSON.parse(localStorage.getItem('user')) ?? { id: 1, username: 'ann', role: 'admin' }
		return reply(serverRights ? { ...stored, rights: serverRights } : stored)
	}
	return reply({})
}

let calls
let unknownRoleWrites
let slowRole
let instance
let wrapper
let store
let role

function signedInAs(who) {
	role = who
	localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role }))
}

beforeEach(() => {
	role = 'user'
	vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
	localStorage.clear()
	localStorage.setItem('access_token', 'a')
	localStorage.setItem('refresh_token', 'r')
	localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role }))
	sockets.io.mockClear()
	sockets.opened.mockClear()
	calls = []
	beta = false
	serverRights = null
	cpuPercent = 0
	unknownRoleWrites = []
	slowRole = false
})

afterEach(async () => {
	wrapper?.unmount()
	// a read still on its way when the dashboard went (a module import, a poll) lands in this test's array, not the next one's
	await flushPromises()
	vi.useRealTimers()
})

async function boot({ minute = true } = {}) {
	vi.resetModules()
	store = (await import('@/store')).default
	const service = await import('@/service/service')
	instance = service.instance
	const mine = (calls = [])
	instance.defaults.adapter = (config) => {
		const url = new URL(config.url, 'http://box')
		mine.push(`${config.method.toUpperCase()} ${url.pathname}`)
		if (config.method !== 'get' && !store.state.user.role)
			unknownRoleWrites.push(`${config.method.toUpperCase()} ${url.pathname}`)
		const answer = { data: answerFor(config.method, url.pathname), status: 200, statusText: 'OK', headers: {}, config }
		// the server says who the account is late, for the case where nothing is stored
		return url.pathname === '/v1/users/current' && slowRole ? new Promise(done => setTimeout(() => done(answer), 3000)) : Promise.resolve(answer)
	}
	const { default: Home } = await import('./Home.vue')
	const { default: api } = await import('@/service/api.js')
	const { default: openAPI } = await import('@/service/index.js')
	const { default: i18n } = await import('@/plugins/i18n')
	const { default: socketPlugin, connectBus } = await import('@/plugins/socket.js')
	const { default: createEventBus } = await import('@/events/eventBus.js')
	const { default: messageBus } = await import('@/events/index.js')
	const { default: VAnimateCss } = await import('@/plugins/animate-css')
	wrapper = mount(Home, {
		attachTo: document.body,
		global: {
			plugins: [Buefy, i18n, store, VAnimateCss, [socketPlugin, connectBus(store)]],
			directives: { 'dompurify-html': {} },
			stubs: { RouterLink: true, RouterView: true },
			mocks: { $api: api, $openAPI: openAPI, $EventBus: createEventBus(), $messageBus: messageBus, $baseIp: 'box', $baseURL: 'box', $route: { query: {} } },
		},
	})
	await flushPromises()
	if (minute) {
		// the lists refresh by themselves: let them, for a minute
		await pass(60000)
	}
}

async function pass(ms) {
	for (let i = 0; i < ms / 1000; i++) {
		await vi.advanceTimersByTimeAsync(1000)
		await flushPromises()
	}
}

const gridReads = () => calls.filter(call => call === 'GET /v2/app_management/web/appgrid').length

// only this one needs the Gateway's own file, and says so in its title when it is absent
const sameAsGateway = hasGateway ? it : it.skip
const gatewayNote = hasGateway ? '' : ` (SKIPPED: ${GATEWAY_TABLE} does not exist)`

describe('the dashboard in the session of an account of role user', () => {
	sameAsGateway(`keeps the copy of the Gateway's list identical to the Gateway's own${gatewayNote}`, () => {
		const lines = file => readFileSync(file, 'utf8').split(String.fromCharCode(10)).map(line => line.trim()).filter(line => !line.startsWith('# COPY of'))
		expect(lines(TABLE)).toEqual(lines(GATEWAY_TABLE))
	})

	it('makes no call outside the list of the Gateway', async () => {
		const table = allowed()
		expect(table.length).toBeGreaterThan(30)

		await boot()

		expect(calls.length).toBeGreaterThan(3)
		const outside = [...new Set(calls)].filter(call => !table.some(rule => rule.test(call)))
		expect(outside).toEqual([])
	}, 60000)

	// each right opens the reads of its module and no other, on the classic dashboard and on the new one, which reads them all
	const someRights = [[['system']], [['system', 'storage']], [['system', 'backups']], [['system', 'fleet']], [['vm']], [['backups']], [['storage']], [['fleet']], [['storage', 'vm', 'backups', 'fleet', 'system']]]
	it.each(someRights)('with the rights %j, makes no call outside the list of the Gateway for them on the classic dashboard', async (rights) => {
		localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role: 'user', rights }))
		await boot()

		expect([...new Set(calls)].filter(call => !allowed(rights).some(rule => rule.test(call)))).toEqual([])
	}, 60000)

	it.each(someRights)('with the rights %j, makes no call outside the list of the Gateway for them on the new dashboard, and reads each module it shows', async (rights) => {
		localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role: 'user', rights }))
		beta = true
		await boot()

		expect([...new Set(calls)].filter(call => !allowed(rights).some(rule => rule.test(call)))).toEqual([])
		// each module is shown with its own right, whatever the others
		const base = allowed()
		for (const right of rights) {
			const own = allowed([right]).filter(rule => !base.some(b => b.source === rule.source))
			expect(calls.some(call => own.some(rule => rule.test(call))), right).toBe(true)
		}
	}, 60000)

	// the sign-in's answer has no rights: the server's word on them comes after the first render, and is followed
	it.each([[false], [true]])('takes rights granted after the first render (new dashboard: %s)', async (newDashboard) => {
		beta = newDashboard
		serverRights = ['system', 'vm']
		await boot()

		expect(calls).toContain('GET /v1/sys/utilization')
		expect(calls).toContain('GET /v2/virt_management/vms')
		expect([...new Set(calls)].filter(call => !allowed(serverRights).some(rule => rule.test(call)))).toEqual([])
	}, 60000)

	it.each([[false], [true]])('stops every read of a module once the server says its rights are gone (new dashboard: %s)', async (newDashboard) => {
		localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role: 'user', rights: ['storage', 'vm', 'backups', 'fleet', 'system'] }))
		beta = newDashboard
		serverRights = []
		await boot({ minute: false })
		await pass(2000)
		calls.length = 0
		await pass(120000)

		expect(calls.length).toBeGreaterThan(0)
		expect([...new Set(calls)].filter(call => !allowed().some(rule => rule.test(call)))).toEqual([])
	}, 60000)

	it('without rights, makes no call of a module even on the new dashboard', async () => {
		beta = true
		await boot()

		expect([...new Set(calls)].filter(call => !allowed().some(rule => rule.test(call)))).toEqual([])
	}, 60000)

	it('keeps the calls of the box itself and the message bus for the owner', async () => {
		signedInAs('admin')
		await boot()

		expect(calls).toContain('GET /v1/sys/utilization')
		expect(calls).toContain('GET /v2/users/events')
		expect(sockets.opened).toHaveBeenCalled()
	}, 60000)

	it('waits for the role of the owner when none is stored, and rewrites none of its saved choices meanwhile', async () => {
		localStorage.removeItem('user')
		slowRole = true
		const errors = vi.spyOn(console, 'error')
		await boot()

		expect(calls).toContain('GET /v1/sys/utilization')
		expect(calls).toContain('GET /v2/users/events')
		expect(sockets.opened).toHaveBeenCalled()
		expect(unknownRoleWrites).toEqual([])
		expect(errors).not.toHaveBeenCalled()
		errors.mockRestore()
	}, 60000)

	it('shows the side bar with the clock only, and no Files, App Store, notices or file panel', async () => {
		await boot()

		expect(calls).toContain('GET /v1/users/current/custom/widgets_config')
		expect(wrapper.vm.$store.getters.canWrite).toBe(false)
		expect(wrapper.text()).toContain('Time')
		expect(wrapper.text()).not.toContain('System status')
		expect(wrapper.findComponent({ name: 'CoreService' }).exists()).toBe(false)
		expect(wrapper.find('.file-panel').exists()).toBe(false)
		expect(wrapper.text()).toContain('Immich')
		expect(wrapper.text()).not.toContain('App Store')
		expect(wrapper.text()).not.toMatch(/\bFiles\b/)
	}, 60000)

	it('shows the owner the whole of it', async () => {
		signedInAs('admin')
		await boot()

		expect(wrapper.text()).toContain('System status')
		expect(wrapper.findComponent({ name: 'CoreService' }).exists()).toBe(true)
		expect(wrapper.text()).toContain('App Store')
	}, 60000)

	it('does not open the message bus or post an event', async () => {
		await boot()
		wrapper.vm.$messageBus('global_visit')
		await flushPromises()

		expect(sockets.opened).not.toHaveBeenCalled()
		expect(calls.filter(call => call.includes('/v2/message_bus/'))).toEqual([])
	}, 60000)

	it('reads its lists every 10 s while the page is shown, and stops at sign-out', async () => {
		await boot({ minute: false })
		calls.length = 0
		await pass(30000)
		expect(gridReads()).toBe(3)

		wrapper.unmount()
		calls.length = 0
		await pass(30000)
		expect(gridReads()).toBe(0)
	}, 60000)

	it('does not read its lists while the page is hidden, and reads them as it is shown again', async () => {
		await boot({ minute: false })
		const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
		calls.length = 0
		await pass(30000)
		expect(gridReads()).toBe(0)

		hidden.mockReturnValue(false)
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(gridReads()).toBe(1)
		hidden.mockRestore()
	}, 60000)

	// no message bus in a user session: the box's load would stand still on the widgets
	const utilizationReads = () => calls.filter(call => call === 'GET /v1/sys/utilization').length
	it('with the system right, reads the load of the box every 10 s while shown, into what the widgets show, and stops at sign-out', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role: 'user', rights: ['system'] }))
		await boot({ minute: false })
		calls.length = 0
		cpuPercent = 42
		await pass(30000)
		expect(utilizationReads()).toBe(3)
		expect(store.state.hardwareInfo.cpu.percent).toBe(42)

		const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
		document.dispatchEvent(new Event('visibilitychange'))
		calls.length = 0
		await pass(30000)
		expect(utilizationReads()).toBe(0)
		hidden.mockReturnValue(false)
		document.dispatchEvent(new Event('visibilitychange'))
		await flushPromises()
		expect(utilizationReads()).toBe(1)
		hidden.mockRestore()

		wrapper.unmount()
		calls.length = 0
		await pass(30000)
		expect(utilizationReads()).toBe(0)
	}, 60000)

	it('stops reading the load of the box once the system right is gone, and the owner has the bus for it', async () => {
		localStorage.setItem('user', JSON.stringify({ id: 2, username: 'ann', role: 'user', rights: ['system'] }))
		serverRights = []
		await boot({ minute: false })
		await pass(2000)
		calls.length = 0
		await pass(30000)
		expect(utilizationReads()).toBe(0)

		wrapper.unmount()
		signedInAs('admin')
		serverRights = null
		await boot({ minute: false })
		await pass(2000)
		calls.length = 0
		await pass(30000)
		expect(utilizationReads()).toBe(0)
	}, 60000)

	it('lets the owner keep its own pace of 5 s', async () => {
		signedInAs('admin')
		await boot({ minute: false })
		calls.length = 0
		await pass(30000)
		expect(gridReads()).toBeGreaterThanOrEqual(6)
	}, 60000)
})
