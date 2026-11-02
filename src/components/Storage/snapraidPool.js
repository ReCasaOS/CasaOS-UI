// The SnapRAID storage: several drives merged into one storage, plus a drive that can rebuild any one of them when it dies. This file picks the drives the dashboard
// offers and runs, behind one button, what the Storage manager asks for in three places: create the storages, set up SnapRAID, merge.

export const POOL = '/DATA'

export const POOL_STEPS = ['storages', 'protection', 'merge', 'sync']

// A storage of its own that a merge can take (mounted, CasaOS's, neither the system nor already merged) keeps its files. A drive that is no storage yet is mounted as
// it is when it holds a filesystem, and erased only when it has to be formatted.
export function poolDisks(storages, drives) {
	const stores = storages
		.filter(storage => !storage.isSystem && !storage.isMergeSource && storage.mount_point && storage.persistedIn === 'casaos')
		.map(storage => ({ key: storage.mount_point, kind: 'storage', name: storage.name, size: Number(storage.size), uuid: storage.uuid, mountPoint: storage.mount_point, array: Boolean(storage.raid) }))
	const blank = drives.map(drive => ({ key: drive.path, kind: 'drive', name: `${drive.name} (${drive.model})`, size: Number(drive.size), path: drive.path, erased: Boolean(drive.need_format) }))
	return [...stores, ...blank]
}

// The parity is never an array: a RAID array as parity is not tried.
export function parityChoices(disks, dataKeys) {
	return disks.filter(disk => !dataKeys.includes(disk.key) && !disk.array)
}

// The biggest of the others: the parity has to hold as much as the fullest merged drive.
export function suggestParity(disks, dataKeys) {
	return parityChoices(disks, dataKeys).reduce((best, disk) => (!best || disk.size > best.size ? disk : best), null)
}

export function errorMessage(e) {
	return e?.response?.data?.message || e?.response?.data?.data || e?.message || String(e)
}

// Stops the running apps while /DATA changes under them, merges the storages of uuids, and starts the apps again whatever came of it. MergeStorages.vue does the
// same behind its own confirmations.
async function mergeStorages({ $api, $openAPI }, uuids) {
	const apps = ((await $openAPI.appGrid.getAppGrid()).data.data || []).filter(app => app.status === 'running')
	const setState = (app, state) => (app.app_type === 'v2app'
		? $openAPI.appCompose.setComposeAppStatus(app.name, state)
		: $api.container.updateState(app.name, state))
	try {
		await Promise.all(apps.map(app => setState(app, 'stop')))
		const initialized = (await $api.local_storage.getInitMergerfsStatus()).data.data === 'initialized'
		if (!initialized) {
			await $api.local_storage.initMergerfs({ mount_point: POOL })
		}
		await $api.local_storage.updateMergerfsInfo({ fstype: 'fuse.mergerfs', mount_point: POOL, source_base_path: '', source_volume_uuids: uuids })
	} finally {
		await Promise.allSettled(apps.map(app => setState(app, 'start')))
	}
}

// Makes the SnapRAID storage of data (the disks of poolDisks to merge) and parity (the one that protects them): the drives become storages, SnapRAID is set up
// on their mount points (it writes nothing to the disks yet, and refuses a parity that is too small before anything is merged), the storages are merged and the first
// sync starts. step(id) says which step of POOL_STEPS begins. Throws at the step that failed, the ones before it stay done; resolves with whether the first sync
// started, which is no reason to undo the rest: the daily sync does it anyway.
export async function createSnapRaid(ctx, { data, parity, taken = [] }, step = () => {}) {
	const { $api } = ctx

	step('storages')
	const names = new Set(taken)
	const freeName = (base) => {
		let n = 1
		while (names.has(`${base}${n}`)) {
			n++
		}
		names.add(`${base}${n}`)
		return `${base}${n}`
	}
	const drives = [...data, parity].filter(disk => disk.kind === 'drive')
	for (const drive of drives) {
		const res = await $api.storage.create({ path: drive.path, name: freeName(drive === parity ? 'Parity' : 'Data'), format: drive.erased })
		if (res.data.success !== 200) {
			throw new Error(res.data.message || drive.path)
		}
	}
	// the storage a drive became is the one on its path
	const made = {}
	if (drives.length) {
		for (const group of (await $api.storage.list()).data.data) {
			if (group.children?.length) {
				made[group.path] = group.children[0]
			}
		}
	}
	const place = (disk) => {
		const found = disk.kind === 'storage' ? { uuid: disk.uuid, mount_point: disk.mountPoint } : made[disk.path]
		if (!found?.uuid || !found.mount_point) {
			throw new Error(disk.name)
		}
		return found
	}
	const dataPlaces = data.map(place)
	const parityPlace = place(parity)

	step('protection')
	await $api.disks.protectDisks(dataPlaces.map(p => p.mount_point), [parityPlace.mount_point])

	step('merge')
	await mergeStorages(ctx, dataPlaces.map(p => p.uuid))

	step('sync')
	try {
		await $api.disks.runSnapraid('sync')
		return { syncStarted: true }
	} catch (e) {
		return { syncStarted: false, reason: errorMessage(e) }
	}
}
