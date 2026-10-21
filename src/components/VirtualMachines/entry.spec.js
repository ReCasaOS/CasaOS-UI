// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The card shows only where the module answers through the gateway; a 404
// means it is not installed, anything else may pass and is asked again.
const get = vi.fn()
vi.mock('@/service/service.js', () => ({ api: { get } }))

async function freshEntry() {
	vi.resetModules()
	return import('./entry.js')
}

describe('hasVirtualMachines', () => {
	beforeEach(() => {
		get.mockReset()
	})

	it('asks the module once when it answers', async () => {
		get.mockResolvedValue({ data: {} })
		const { hasVirtualMachines } = await freshEntry()
		expect(await hasVirtualMachines()).toBe(true)
		expect(await hasVirtualMachines()).toBe(true)
		expect(get).toHaveBeenCalledTimes(1)
		expect(get).toHaveBeenCalledWith('/v2/virt_management/host')
	})

	it('stops asking when the gateway has no such route', async () => {
		get.mockRejectedValue({ response: { status: 404 } })
		const { hasVirtualMachines } = await freshEntry()
		expect(await hasVirtualMachines()).toBe(false)
		expect(await hasVirtualMachines()).toBe(false)
		expect(get).toHaveBeenCalledTimes(1)
	})

	it('asks again after any other failure', async () => {
		get.mockRejectedValueOnce({ response: { status: 502 } }).mockResolvedValueOnce({ data: {} })
		const { hasVirtualMachines } = await freshEntry()
		expect(await hasVirtualMachines()).toBe(false)
		expect(await hasVirtualMachines()).toBe(true)
		expect(get).toHaveBeenCalledTimes(2)
	})
})

// The app grid's tiles: one per VM, by title, each opening its console or the
// page on that VM.
describe('the VM tiles of the app grid', () => {
	beforeEach(() => {
		get.mockReset()
	})

	it('lists the VMs by title, numbers as numbers, and drops what is not a VM', async () => {
		get.mockResolvedValue({ data: { data: [
			{ id: 'b', title: 'VM 10', state: 'running' },
			{ id: 'a', title: 'VM 2', state: 'shut-off' },
			{ id: 42, title: 'not a VM' },
			null,
		] } })
		const { listVirtualMachines } = await freshEntry()

		const vms = await listVirtualMachines()

		expect(get).toHaveBeenCalledWith('/v2/virt_management/vms')
		expect(vms.map(vm => vm.id)).toEqual(['a', 'b'])
	})

	it('opens the page on the VM it is given', async () => {
		const open = vi.fn(() => ({ close: vi.fn() }))
		const { openVirtualMachines } = await freshEntry()

		openVirtualMachines({ modal: { open } }, {}, 'vm-2')

		expect(open.mock.calls[0][0].props).toEqual({ selectId: 'vm-2' })
	})

	it('opens the page on its own tab on the VM, when the setting says so', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null)
		const { openVirtualMachines } = await freshEntry()

		openVirtualMachines({ modal: { open: vi.fn() } }, { appLaunchInIframe: false, appLaunchExceptions: [] }, 'a/b c')

		expect(open).toHaveBeenCalledWith(expect.stringMatching(/#\/vms\?vm=a%2Fb%20c$/), '_blank')
		open.mockRestore()
	})

	it('opens the console the way the page does, closed by its own button only', async () => {
		const open = vi.fn()
		const { openVmConsole } = await freshEntry()
		const vm = { id: 'vm-1', title: 'Debian', state: 'running' }

		openVmConsole({ modal: { open } }, vm)

		expect(open.mock.calls[0][0]).toMatchObject({ fullScreen: true, canCancel: [], customClass: 'vm-console-modal', props: { vm } })
	})
})

describe('reading one VM, and the time limits', () => {
	beforeEach(() => {
		get.mockReset()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it('reads one VM by its id', async () => {
		get.mockResolvedValue({ data: { data: { id: 'a/b', state: 'running' } } })
		const { getVirtualMachine } = await freshEntry()

		expect(await getVirtualMachine('a/b', 5000)).toEqual({ id: 'a/b', state: 'running' })
		expect(get).toHaveBeenCalledWith('/v2/virt_management/vms/a%2Fb')
	})

	it('gives up on a call that does not answer in time', async () => {
		vi.useFakeTimers()
		const { withTimeout } = await freshEntry()

		const caught = withTimeout(new Promise(() => {}), 5000).catch(e => e)
		await vi.advanceTimersByTimeAsync(5000)

		expect((await caught).message).toMatch(/time/i)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('lets an answer in time through, and leaves no timer behind', async () => {
		vi.useFakeTimers()
		const { withTimeout } = await freshEntry()

		expect(await withTimeout(Promise.resolve(1), 5000)).toBe(1)
		expect(vi.getTimerCount()).toBe(0)
	})
})
