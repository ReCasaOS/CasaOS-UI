// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sys from './sys.js'
import { instance } from './service.js'

// service.js wires its 401 interceptor to the router and the store; neither
// is exercised here.
vi.mock('@/router', () => ({ default: { replace() {} } }))
vi.mock('@/store', () => ({ default: { commit() {} } }))

// A fake adapter sees the request as XHR would, after transformRequest.
const adapter = vi.fn(config => Promise.resolve({ data: { success: 200, data: {} }, status: 200, statusText: 'OK', headers: {}, config }))
instance.defaults.adapter = adapter

const sent = () => adapter.mock.calls[0][0]

describe('anonymous statistics client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the state from the core\'s v1 sys group', async () => {
		await sys.getTelemetry()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/telemetry')
	})

	it('sends only the fields it is given', async () => {
		await sys.setTelemetry({ notice_seen: true })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/telemetry')
		expect(JSON.parse(sent().data)).toEqual({ notice_seen: true })
	})
})

describe('automatic update client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the view from the core\'s v1 sys group', async () => {
		await sys.getAutoUpdate()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/autoupdate')
	})

	it('sends only the fields it is given', async () => {
		await sys.setAutoUpdate({ resume: true })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/autoupdate')
		expect(JSON.parse(sent().data)).toEqual({ resume: true })
	})
})

describe('push alerts client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the masked view from the core\'s v1 sys group', async () => {
		await sys.getAlerts()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/alerts')
	})

	it('sends only the fields it is given', async () => {
		await sys.setAlerts({ disk_threshold: 85 })
		expect(sent().method).toBe('put')
		expect(sent().url).toBe('/v1/sys/alerts')
		expect(JSON.parse(sent().data)).toEqual({ disk_threshold: 85 })
	})

	it('tests one channel', async () => {
		await sys.testAlerts({ channel_id: 'a1' })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/alerts/test')
		expect(JSON.parse(sent().data)).toEqual({ channel_id: 'a1' })
	})
})

describe('docker update client', () => {
	beforeEach(() => adapter.mockClear())

	it('lists the running containers from the core\'s v1 sys group', async () => {
		await sys.getDockerContainers()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/docker/containers')
	})

	it('starts the update with the plan it was shown, and nothing else', async () => {
		await sys.startDockerUpdate({ plan_id: 'ab'.repeat(32) })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/docker/update')
		expect(JSON.parse(sent().data)).toEqual({ plan_id: 'ab'.repeat(32) })
	})

	it('carries the confirmation of a hold when it is given, as it is given', async () => {
		await sys.startDockerUpdate({ plan_id: 'ab'.repeat(32), allow_held: true })
		expect(sent().url).toBe('/v1/sys/docker/update')
		expect(JSON.parse(sent().data)).toEqual({ plan_id: 'ab'.repeat(32), allow_held: true })
	})

	it('reads the status from its own route, not the generic package one', async () => {
		await sys.getDockerUpdateStatus()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/docker/update/status')
	})
})

describe('operating system client', () => {
	beforeEach(() => adapter.mockClear())

	it('reads the support state from the core\'s v1 sys group, and sends nothing', async () => {
		await sys.getOs()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os')
		expect(sent().data).toBeUndefined()
	})

	// The core answers within 20 seconds (its checks run in parallel, with a budget), so the
	// call waits 30 and not the 60 of the shared client.
	it('asks whether the machine can be upgraded from its own route, sends nothing, and waits 30 seconds', async () => {
		await sys.getOsReadiness()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/readiness')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(30000)
	})

	// The plan: its own routes, and the token in the header (the instance puts it there), never in the address.
	it('starts the plan from its own route, sends nothing, waits 15 seconds, and puts nothing in the address', async () => {
		await sys.startOsPlan()
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/os/upgrade/plan')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(15000)
		expect(sent().params).toBeUndefined()
	})

	it('asks how the plan is going from the same route, and sends nothing', async () => {
		await sys.getOsPlan()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/upgrade/plan')
		expect(sent().data).toBeUndefined()
		expect(sent().params).toBeUndefined()
		expect(sent().timeout).toBe(30000)
	})

	it('asks for the runbook from its own route, and sends nothing', async () => {
		await sys.getOsRunbook()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/upgrade/runbook')
		expect(sent().data).toBeUndefined()
		expect(sent().params).toBeUndefined()
		expect(sent().timeout).toBe(15000)
	})
})

describe('upgrade of the operating system client', () => {
	beforeEach(() => adapter.mockClear())

	it('asks how the upgrade is going from its own route, sends nothing, and waits 10 seconds', async () => {
		await sys.getOsUpgradeStatus()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/upgrade/status')
		expect(sent().data).toBeUndefined()
		expect(sent().params).toBeUndefined()
		expect(sent().timeout).toBe(10000)
	})

	// The switch has to say true or false: a body that says nothing must not be read as "off".
	it.each([[true, true], [false, false], [undefined, false], ['yes', false], [1, false]])('switches the upgrade with %s as %s, and says nothing else', async (given, sentValue) => {
		await sys.setOsUpgradeBeta(given)
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/os/upgrade/beta')
		expect(JSON.parse(sent().data)).toEqual({ enabled: sentValue })
		expect(sent().timeout).toBe(15000)
	})

	it.each([[true, true], [false, false], [undefined, false], ['yes', false]])('refreshes with the change accepted as %s -> %s, and waits as long as the core', async (given, sentValue) => {
		await sys.startOsRefresh(given)
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/os/upgrade/refresh')
		expect(JSON.parse(sent().data)).toEqual({ accept_releaseinfo_change: sentValue })
		expect(sent().timeout).toBe(300000)
	})

	it('starts the upgrade with the body it is given, as it is given, and waits as long as the core', async () => {
		const body = { plan_id: `p1-${'ab'.repeat(16)}`, rehearsal: false, safety_net: 'snapshot', hostname: 'box', accept_removals: ['fuse'], paused_sources: ['docker.list'], acks: ['no_interruption', 'no_way_back'] }
		await sys.startOsUpgrade(body)
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/os/upgrade/start')
		expect(JSON.parse(sent().data)).toEqual(body)
		expect(sent().timeout).toBe(300000)
	})

	// The core refuses a body that is not a JSON object: a button with nothing to say sends {}.
	it.each([
		['rebootOsUpgrade', 'reboot'],
		['resumeOsUpgrade', 'resume'],
		['abortOsUpgrade', 'abort'],
	])('%s posts an empty object to its own route', async (name, route) => {
		await sys[name]()
		expect(sent().method).toBe('post')
		expect(sent().url).toBe(`/v1/sys/os/upgrade/${route}`)
		expect(sent().data).toBe('{}')
		expect(sent().params).toBeUndefined()
		expect(sent().timeout).toBe(60000)
	})

	it('sends the word of the person with the action, as it is given', async () => {
		await sys.ackOsUpgrade({ action: 'acknowledge', word: 'I-KNOW-THIS-MACHINE-IS-HALF-UPGRADED' })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/os/upgrade/ack')
		expect(JSON.parse(sent().data)).toEqual({ action: 'acknowledge', word: 'I-KNOW-THIS-MACHINE-IS-HALF-UPGRADED' })
		expect(sent().timeout).toBe(120000)
	})

	it('asks for the text of the run that is open, with the run asked for in the address and nothing else', async () => {
		await sys.getOsUpgradeRunbook()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/os/upgrade/runbook?run=current')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(15000)
	})

	// The token goes in the header, which the instance sets, and in no address, body or query.
	it.each([
		['getOsUpgradeStatus', []],
		['setOsUpgradeBeta', [true]],
		['startOsRefresh', [false]],
		['startOsUpgrade', [{ plan_id: 'x' }]],
		['rebootOsUpgrade', []],
		['resumeOsUpgrade', []],
		['abortOsUpgrade', []],
		['ackOsUpgrade', [{ action: 'discard', word: '' }]],
		['getOsUpgradeRunbook', []],
	])('%s carries the access token in the Authorization header and nowhere else', async (name, args) => {
		localStorage.setItem('access_token', 'the-access-token')
		try {
			await sys[name](...args)
		} finally {
			localStorage.removeItem('access_token')
		}
		expect(sent().headers.Authorization).toBe('the-access-token')
		expect(sent().url).not.toContain('the-access-token')
		expect(JSON.stringify(sent().data ?? '')).not.toContain('the-access-token')
		expect(sent().params).toBeUndefined()
	})
})

describe('modules client', () => {
	beforeEach(() => adapter.mockClear())

	const PLAN = `m1-${'ab'.repeat(16)}`

	it('asks for the list from its own route, sends nothing, and waits a little longer than the core', async () => {
		await sys.getModules()
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/modules')
		expect(sent().data).toBeUndefined()
		expect(sent().params).toBeUndefined()
		expect(sent().timeout).toBe(35000)
	})

	it('asks for the plan with an empty object, waits longer than the minute the core takes, and passes the cancel signal on', async () => {
		const controller = new AbortController()
		await sys.planModule('virt', controller.signal)
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/modules/virt/plan')
		expect(sent().data).toBe('{}')
		expect(sent().timeout).toBe(70000)
		expect(sent().signal).toBe(controller.signal)
	})

	// the core refuses a body with a field it does not know: nothing but the id goes
	it('installs with the plan id and nothing else', async () => {
		await sys.installModule('virt', { plan_id: PLAN, name: 'other', rehearsal: true })
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/modules/virt/install')
		expect(JSON.parse(sent().data)).toEqual({ plan_id: PLAN })
		expect(sent().timeout).toBe(130000)
	})

	it('installs with no plan id as an empty object, which the core refuses by name, and not with a made-up one', async () => {
		await sys.installModule('virt')
		expect(sent().data).toBe('{}')
	})

	it('removes with an empty object', async () => {
		await sys.removeModule('virt')
		expect(sent().method).toBe('post')
		expect(sent().url).toBe('/v1/sys/modules/virt/remove')
		expect(sent().data).toBe('{}')
		expect(sent().timeout).toBe(70000)
	})

	it('asks how the job is going from the status of the module, and sends nothing', async () => {
		await sys.getModuleStatus('virt')
		expect(sent().method).toBe('get')
		expect(sent().url).toBe('/v1/sys/modules/virt/status')
		expect(sent().data).toBeUndefined()
		expect(sent().timeout).toBe(20000)
	})

	// the name is a piece of the address: only the core's own rule goes into one, and no request is made for anything else
	it.each(['', '../sys', 'virt/plan', 'virt?x=1', 'Virt', 'a b', '1virt', 'virt\n', 'v'.repeat(33), undefined, null, 5, {}, ['virt']])('puts no name like %j in an address', (name) => {
		for (const call of [sys.planModule, sys.installModule, sys.removeModule, sys.getModuleStatus])
			expect(() => call(name, { plan_id: PLAN })).toThrow('not the name of a module')
		expect(adapter).not.toHaveBeenCalled()
	})

	// The token goes in the header, which the instance sets, and in no address, body or query.
	it.each([
		['getModules', []],
		['planModule', ['virt']],
		['installModule', ['virt', { plan_id: PLAN }]],
		['removeModule', ['virt']],
		['getModuleStatus', ['virt']],
	])('%s carries the access token in the Authorization header and nowhere else', async (name, args) => {
		localStorage.setItem('access_token', 'the-access-token')
		try {
			await sys[name](...args)
		} finally {
			localStorage.removeItem('access_token')
		}
		expect(sent().headers.Authorization).toBe('the-access-token')
		expect(sent().url).not.toContain('the-access-token')
		expect(JSON.stringify(sent().data ?? '')).not.toContain('the-access-token')
		expect(sent().params).toBeUndefined()
	})
})
