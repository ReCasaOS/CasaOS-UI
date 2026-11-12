// What the dashboard says about the storage layer's pools (GET /v2/storage), and what each action asks.
import { raidTag } from './raid'

// the pool's state as a tag, as for a RAID array
export function poolTag(pool, t) {
	return raidTag(pool, t)
}

// a layout in a person's words, short; stripe is speed only (the same protection)
export function layoutName(layout, t) {
	switch (layout?.kind) {
		case 'mirror':
			return layout.stripe ? t('Mirror, {copies} copies, striped', { copies: layout.copies }) : t('Mirror, {copies} copies', { copies: layout.copies })
		case 'parity':
			return layout.parity === 1 ? t('Parity (RAID 5)') : t('Double parity (RAID 6)')
		case 'none':
			return layout.stripe ? t('No protection, striped') : t('No protection')
	}
	return ''
}

// how many failing disks the pool survives now, in words
export function survives(n, t) {
	if (n <= 0) {
		return t('No disk may fail')
	}
	return n === 1 ? t('Survives 1 disk failing') : t('Survives {n} disks failing', { n })
}

// the title of each action
export function verbTitle(verb, t) {
	return {
		'create-pool': t('Create a pool'),
		'delete-pool': t('Delete the pool'),
		'add-disk': t('Add a disk'),
		'replace-disk': t('Replace a disk'),
		'remove-disk': t('Take a disk out'),
		'change-layout': t('Change protection'),
		'restore-layout': t('Restore protection'),
		'check': t('Check now'),
		'cancel-check': t('Stop the check'),
		'mount-degraded': t('Mount with a disk missing'),
		'wipe-disk': t('Wipe the disk'),
	}[verb] || verb
}

// what an action asks before its preview: the free disks (none, one, several), a member, a layout
export function choices(verb, pool) {
	switch (verb) {
		case 'create-pool':
			return { disks: 'many', layout: true }
		case 'add-disk':
			return { disks: pool?.backend === 'md' ? 'one' : 'many' }
		case 'replace-disk':
			return { disks: 'one', member: true }
		case 'remove-disk':
			return { member: true }
		case 'change-layout':
			return { layout: true }
	}
	return {}
}

// the layouts a pool can change to: the btrfs ones it is not
export function layoutTargets(pool) {
	const all = [{ kind: 'none' }, { kind: 'none', stripe: true }, { kind: 'mirror', copies: 2 }, { kind: 'mirror', copies: 2, stripe: true }, { kind: 'mirror', copies: 3 }]
	const same = l => l.kind === pool.layout.kind && (l.copies || 0) === (pool.layout.copies || 0) && Boolean(l.stripe) === Boolean(pool.layout.stripe)
	return all.filter(l => !(pool?.layout_known && same(l)))
}

// the members a verb can be asked about
export function memberChoices(verb, pool) {
	const members = pool?.members || []
	if (verb === 'remove-disk' && pool?.backend === 'md') {
		return members.filter(m => m.state === 'faulty' || m.state === 'spare')
	}
	return members
}

// the free disks for a verb, given the member it replaces (big enough for it)
export function diskChoices(verb, drives, member) {
	const free = (drives || []).filter(d => d.role === 'free')
	if (verb === 'replace-disk' && member) {
		return free.filter(d => d.size >= (member.size || 0))
	}
	return free
}

// the intent sent for the preview; every verb but create-pool and wipe-disk names its pool
export function intent(verb, { pool = '', disks = [], member = '', layout = null } = {}) {
	const i = { verb }
	if (pool && verb !== 'create-pool' && verb !== 'wipe-disk') {
		i.pool = pool
	}
	if (disks.length) {
		i.disks = disks
	}
	if (member) {
		i.member = member
	}
	if (layout) {
		i.layout = layout
	}
	return i
}

// a pool is doing something long: the dashboard looks again soon
export function poolWorking(view) {
	const working = p => p.action !== 'idle' || ['rebuilding', 'resyncing', 'checking', 'reshaping'].includes(p.state)
	return Boolean(view?.busy || (view?.pools || []).some(working))
}
