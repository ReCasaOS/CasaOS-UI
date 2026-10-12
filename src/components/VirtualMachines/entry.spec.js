import { beforeEach, describe, expect, it, vi } from 'vitest'

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
