// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/router', () => ({ default: { replace: vi.fn() } }))
vi.mock('@/store', () => ({ default: { commit: vi.fn() } }))

const { instance } = await import('@/service/service.js')
const { default: disks } = await import('@/service/disks.js')

// api.get already puts its second argument under `params`: the snapshots went out as
// ?params[dataset]=..., the box saw no dataset and answered "no such ZFS dataset".
describe('the snapshots of a ZFS dataset', () => {
	it('are asked for with ?dataset=, as the box reads it', async () => {
		const sent = []
		instance.defaults.adapter = (config) => {
			sent.push(config)
			return Promise.resolve({ status: 200, statusText: 'OK', headers: {}, config, data: {} })
		}

		await disks.zfsSnapshots('pool1/appdata')

		expect(sent).toHaveLength(1)
		expect(instance.getUri(sent[0])).toBe('/v1/disks/zfs/snapshots?dataset=pool1%2Fappdata')
	})
})
