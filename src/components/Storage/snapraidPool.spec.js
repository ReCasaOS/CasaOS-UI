import { describe, expect, it, vi } from 'vitest'
import { createSnapRaid, folderProblem, normalizeFolder, parityChoices, poolDisks, suggestParity } from './snapraidPool'

const GB = 1e9
const storage = (name, size, extra = {}) => ({ name, size, uuid: `uuid-${name}`, mount_point: `/media/${name}`, persistedIn: 'casaos', isSystem: false, isMergeSource: false, ...extra })
const drive = (name, size, extra = {}) => ({ name, model: 'Disk', size, path: `/dev/${name}`, need_format: true, ...extra })

describe('the drives a SnapRAID is offered', () => {
	it('keeps the storages a merge can take and every drive that is no storage yet', () => {
		const disks = poolDisks(
			[storage('Movies', 4000 * GB), storage('System', 100 * GB, { isSystem: true }), storage('Merged', 2000 * GB, { isMergeSource: true }), storage('Odd', 1 * GB, { persistedIn: 'user' }), storage('Loose', 1 * GB, { mount_point: '' })],
			[drive('sdc', 8000 * GB), drive('sdd', 500 * GB, { need_format: false })],
		)
		expect(disks.map(d => d.key)).toEqual(['/media/Movies', '/dev/sdc', '/dev/sdd'])
		// only a drive that has to be formatted is erased: one that holds a filesystem is mounted as it is
		expect(disks.filter(d => d.erased).map(d => d.key)).toEqual(['/dev/sdc'])
	})

	it('suggests the biggest drive that is left for the parity, and never an array', () => {
		const disks = poolDisks([storage('A', 4000 * GB), storage('B', 4000 * GB), storage('Mirror', 9000 * GB, { raid: { name: 'md0' } })], [drive('sdc', 8000 * GB)])
		expect(suggestParity(disks, ['/media/A', '/media/B']).key).toBe('/dev/sdc')
		expect(suggestParity(disks, ['/media/A', '/dev/sdc']).key).toBe('/media/B')
		expect(parityChoices(disks, []).map(d => d.key)).not.toContain('/media/Mirror')
		expect(suggestParity(disks, ['/media/A', '/media/B', '/dev/sdc'])).toBeNull()
	})
})

// a LocalStorage that answers like a box with the drive /dev/sdc to prepare
function box({ failAt = '', apps = [] } = {}) {
	const calls = []
	const record = (name, fn = () => ({ data: { success: 200, data: [] } })) => vi.fn(async (...args) => {
		calls.push(name)
		if (failAt === name) {
			throw Object.assign(new Error(name), { response: { data: { message: `${name} refused` } } })
		}
		return fn(...args)
	})
	const ctx = {
		$api: {
			storage: {
				create: record('create'),
				list: record('list', () => ({ data: { data: [{ path: '/dev/sdc', children: [{ uuid: 'uuid-sdc1', mount_point: '/media/Parity1' }] }] } })),
			},
			disks: { protectDisks: record('protect'), runSnapraid: record('sync') },
			local_storage: {
				getInitMergerfsStatus: record('status', () => ({ data: { data: 'not-initialized' } })),
				initMergerfs: record('init'),
				updateMergerfsInfo: record('merge'),
			},
			container: { updateState: record('container') },
		},
		$openAPI: {
			appGrid: { getAppGrid: record('apps', () => ({ data: { data: apps } })) },
			appCompose: { setComposeAppStatus: record('compose') },
		},
	}
	return { ctx, calls }
}

const data = [{ kind: 'storage', key: '/media/A', name: 'A', uuid: 'uuid-A', mountPoint: '/media/A', size: 4000 * GB }, { kind: 'storage', key: '/media/B', name: 'B', uuid: 'uuid-B', mountPoint: '/media/B', size: 4000 * GB }]
const parity = { kind: 'drive', key: '/dev/sdc', name: 'sdc (Disk)', path: '/dev/sdc', size: 8000 * GB, erased: true }

describe('making a SnapRAID storage', () => {
	it('prepares the drive, sets the protection up on the mount points, merges, then starts the first sync', async () => {
		const { ctx, calls } = box()
		const steps = []
		const result = await createSnapRaid(ctx, { data, parity, taken: ['A', 'B'] }, id => steps.push(id))
		expect(result).toEqual({ syncStarted: true })
		expect(steps).toEqual(['storages', 'protection', 'merge', 'sync'])
		expect(ctx.$api.storage.create).toHaveBeenCalledWith({ path: '/dev/sdc', name: 'Parity1', format: true })
		expect(ctx.$api.disks.protectDisks).toHaveBeenCalledWith(['/media/A', '/media/B'], ['/media/Parity1'])
		expect(ctx.$api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith({ fstype: 'fuse.mergerfs', mount_point: '/DATA', source_base_path: '', source_volume_uuids: ['uuid-A', 'uuid-B'] })
		// the protection is checked before anything is merged, and the merged storage is initialized first
		expect(calls).toEqual(['create', 'list', 'protect', 'apps', 'status', 'init', 'merge', 'sync'])
	})

	it('creates nothing for storages that already are, and mounts a drive that holds a filesystem without erasing it', async () => {
		const { ctx } = box()
		await createSnapRaid(ctx, { data, parity: { ...parity, erased: false } }, () => {})
		expect(ctx.$api.storage.create).toHaveBeenCalledWith({ path: '/dev/sdc', name: 'Parity1', format: false })

		const { ctx: plain } = box()
		await createSnapRaid(plain, { data, parity: { kind: 'storage', key: '/media/P', name: 'P', uuid: 'uuid-P', mountPoint: '/media/P', size: 8000 * GB } }, () => {})
		expect(plain.$api.storage.create).not.toHaveBeenCalled()
		expect(plain.$api.storage.list).not.toHaveBeenCalled()
		expect(plain.$api.disks.protectDisks).toHaveBeenCalledWith(['/media/A', '/media/B'], ['/media/P'])
	})

	it('gives the new storages names the box does not use yet', async () => {
		const { ctx } = box()
		await createSnapRaid(ctx, { data, parity, taken: ['Parity1', 'Parity2'] }, () => {})
		expect(ctx.$api.storage.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Parity3' }))
	})

	it('stops at a drive that could not be prepared, and touches nothing else', async () => {
		const { ctx, calls } = box()
		ctx.$api.storage.create.mockResolvedValueOnce({ data: { success: 500, message: '/dev/sdc\n' } })
		await expect(createSnapRaid(ctx, { data, parity }, () => {})).rejects.toThrow('/dev/sdc')
		expect(calls).toEqual([])
		expect(ctx.$api.disks.protectDisks).not.toHaveBeenCalled()
	})

	it('merges nothing when the protection is refused', async () => {
		const { ctx, calls } = box({ failAt: 'protect' })
		await expect(createSnapRaid(ctx, { data, parity }, () => {})).rejects.toThrow('protect')
		expect(calls).not.toContain('merge')
		expect(calls).not.toContain('apps')
	})

	it('starts the apps again when the merge fails, and does not start the sync', async () => {
		const apps = [{ name: 'plex', app_type: 'v2app', status: 'running' }, { name: 'old', app_type: 'v1app', status: 'running' }, { name: 'off', app_type: 'v2app', status: 'exited' }]
		const { ctx, calls } = box({ failAt: 'merge', apps })
		await expect(createSnapRaid(ctx, { data, parity }, () => {})).rejects.toThrow('merge')
		expect(ctx.$openAPI.appCompose.setComposeAppStatus.mock.calls).toEqual([['plex', 'stop'], ['plex', 'start']])
		expect(ctx.$api.container.updateState.mock.calls).toEqual([['old', 'stop'], ['old', 'start']])
		expect(calls).not.toContain('sync')
	})

	it('is a success whose first sync did not start: the daily one will do it', async () => {
		const { ctx } = box({ failAt: 'sync' })
		const result = await createSnapRaid(ctx, { data, parity }, () => {})
		expect(result).toEqual({ syncStarted: false, reason: 'sync refused' })
	})

	it('merges in a folder of its own without touching the apps', async () => {
		const apps = [{ name: 'plex', app_type: 'v2app', status: 'running' }]
		const { ctx, calls } = box({ apps })
		await createSnapRaid(ctx, { data, parity, folder: '/media/Pool' }, () => {})
		expect(ctx.$api.local_storage.updateMergerfsInfo).toHaveBeenCalledWith({ fstype: 'fuse.mergerfs', mount_point: '/media/Pool', source_base_path: '', source_volume_uuids: ['uuid-A', 'uuid-B'] })
		// no apps stopped, no /DATA to initialize
		expect(calls).toEqual(['create', 'list', 'protect', 'merge', 'sync'])
		expect(ctx.$openAPI.appCompose.setComposeAppStatus).not.toHaveBeenCalled()
	})

	it('a refused merge in a folder of its own is a failure like any other', async () => {
		const { ctx, calls } = box({ failAt: 'merge' })
		await expect(createSnapRaid(ctx, { data, parity, folder: '/media/Pool' }, () => {})).rejects.toThrow('merge')
		expect(calls).not.toContain('sync')
	})

	it('does not initialize a merged storage that is already', async () => {
		const { ctx } = box()
		ctx.$api.local_storage.getInitMergerfsStatus.mockResolvedValue({ data: { data: 'initialized' } })
		await createSnapRaid(ctx, { data, parity }, () => {})
		expect(ctx.$api.local_storage.initMergerfs).not.toHaveBeenCalled()
	})
})

describe('the folder of the merged storage', () => {
	const stores = [storage('Movies', 4000 * GB), storage('Series', 4000 * GB), storage('System', 100 * GB, { mount_point: '/' })]

	it('accepts a folder of plain names, and /DATA', () => {
		for (const folder of ['/media/Pool', '/media/Pool/', ' /media/Pool ', '/DATA', '/srv/my-pool_2.0']) {
			expect(folderProblem(folder, stores)).toBe('')
		}
		expect(normalizeFolder(' /media/Pool/ ')).toBe('/media/Pool')
	})

	it('refuses what is not an absolute path of plain names', () => {
		for (const folder of ['', '/', 'media/Pool', '/media//Pool', '/media/../etc', '/media/./Pool', '/media/My Pool', '/media/$(id)', '/media/Pool;ls']) {
			expect(folderProblem(folder, stores)).toBe('path')
		}
	})

	it('refuses a folder that is, holds or lies inside a storage, but not because of the system storage at /', () => {
		for (const folder of ['/media/Movies', '/media/Movies/pool', '/media']) {
			expect(folderProblem(folder, stores)).toBe('taken')
		}
		expect(folderProblem('/srv/pool', stores)).toBe('')
	})
})
