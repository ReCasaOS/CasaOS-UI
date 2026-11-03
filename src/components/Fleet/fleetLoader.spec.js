// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SOURCES, ask, loadRows } from './fleetLoader'
import { fleetApi } from '@/service/fleet'

vi.mock('@/service/fleet', () => ({ fleetApi: { status: vi.fn(), relay: vi.fn() } }))

const A = { id: 'a', name: 'Home', online: true }
const B = { id: 'b', name: 'Shop', online: true }
const status = boxes => Promise.resolve({ data: { data: { role: 'master', master: { address: 'https://m', boxes } } } })
const answer = data => Promise.resolve({ data: { success: 200, data } })
const failure = (status, body) => Promise.reject(Object.assign(new Error('Request failed'), status ? { response: { status, data: body } } : {}))
function deferred() {
	let resolve
	const promise = new Promise((res) => {
		resolve = res
	})
	return { promise, resolve }
}
// what each box answers to each path; a promise of the test's own is handed back as it is
function serve(table) {
	fleetApi.relay.mockImplementation((boxId, method, path) => {
		const a = table[boxId]?.[path]
		return a && typeof a.then === 'function' ? a : answer(a ?? { path })
	})
}
const build = (box, answers) => ({ id: box.id, answers })

describe('reading the fleet', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		fleetApi.status.mockReturnValue(status([A, B]))
		serve({})
	})

	it('asks each source of each box once, by its path', async () => {
		const rows = await loadRows(['version', 'os'], build, () => {})
		expect(fleetApi.relay.mock.calls.map(c => c.slice(0, 3)).sort()).toEqual([
			['a', 'get', '/v1/sys/os'],
			['a', 'get', '/v1/sys/version/check'],
			['b', 'get', '/v1/sys/os'],
			['b', 'get', '/v1/sys/version/check'],
		])
		expect(rows.map(r => r.id)).toEqual(['a', 'b'])
		expect(rows[0].answers.version).toEqual({ ok: true, data: { path: '/v1/sys/version/check' } })
		expect(SOURCES.grid).toBe('/v2/app_management/web/appgrid')
		expect(SOURCES.vms).toBe('/v2/virt_management/vms')
	})

	it('renders rows as each box answers', async () => {
		const late = deferred()
		serve({ b: { '/v1/sys/os': late.promise } })
		const onRow = vi.fn()
		const done = loadRows(['os'], build, onRow)
		await flushPromises()
		expect(onRow).toHaveBeenCalledTimes(1)
		expect(onRow.mock.calls[0][0].id).toBe('a')
		late.resolve({ data: { data: { late: true } } })
		const rows = await done
		expect(onRow).toHaveBeenCalledTimes(2)
		expect(rows.map(r => r.id)).toEqual(['a', 'b'])
		expect(rows[1].answers.os).toEqual({ ok: true, data: { late: true } })
	})

	it('an offline box costs no call', async () => {
		fleetApi.status.mockReturnValue(status([{ ...A, online: false }, B]))
		const rows = await loadRows(['os', 'grid'], build, () => {})
		expect(fleetApi.relay.mock.calls.every(c => c[0] === 'b')).toBe(true)
		expect(fleetApi.relay).toHaveBeenCalledTimes(2)
		expect(rows[0].answers.os).toMatchObject({ ok: false, status: 503 })
		expect(rows[0].answers.grid).toMatchObject({ ok: false, status: 503 })
	})

	it('a failing source does not fail the box, and keeps the box\'s message', async () => {
		serve({ a: { '/v1/sys/os': failure(500, { message: 'no os' }), '/v2/virt_management/vms': failure() } })
		const rows = await loadRows(['os', 'vms', 'version'], build, () => {})
		expect(rows[0].answers.os).toEqual({ ok: false, status: 500, error: 'no os' })
		expect(rows[0].answers.vms).toEqual({ ok: false, status: 0, error: 'Request failed' })
		expect(rows[0].answers.version.ok).toBe(true)
		expect(rows[1].answers.os.ok).toBe(true)
	})

	it('flattens a build that gives several rows, and a box without a master gives none', async () => {
		const rows = await loadRows(['grid'], box => [{ id: `${box.id}/1` }, { id: `${box.id}/2` }], () => {})
		expect(rows.map(r => r.id)).toEqual(['a/1', 'a/2', 'b/1', 'b/2'])
		fleetApi.status.mockReturnValue(Promise.resolve({ data: { data: { role: 'none' } } }))
		expect(await loadRows(['grid'], build, () => {})).toEqual([])
	})

	it('ask: the payload of one route, or the failure, never a rejection', async () => {
		serve({ a: { '/v1/sys/packages': failure(409, { message: 'busy' }) } })
		expect(await ask(A, 'version')).toEqual({ ok: true, data: { path: '/v1/sys/version/check' } })
		expect(await ask(A, 'packages')).toEqual({ ok: false, status: 409, error: 'busy' })
		expect(await ask({ ...A, online: false }, 'packages')).toMatchObject({ ok: false, status: 503 })
		expect(fleetApi.relay).toHaveBeenCalledTimes(2)
	})
})
