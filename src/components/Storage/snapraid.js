// What the dashboard says about the SnapRAID protection of the merged storage, from LocalStorage's GET /v1/disks/snapraid.

// "0001-01-01T00:00:00Z" is how Go writes a time that was never set
export function snapraidWhen(at) {
	if (!at || at.startsWith('0001')) {
		return ''
	}
	const date = new Date(at)
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

export function snapraidActionName(action, t) {
	return { diff: t('Looking for changes'), sync: t('Syncing'), scrub: t('Checking the disks'), fix: t('Repairing') }[action] || action
}

// The state of the protection as a tag: its Buefy type and its text, translated with t. What needs a person comes before what is merely late.
export function snapraidTag(state, t) {
	if (state.job) {
		return { type: 'is-info', text: `${snapraidActionName(state.job.action, t)} ${state.job.percent} %` }
	}
	const last = state.last || {}
	if ((state.missing || []).length) {
		return { type: 'is-danger', text: t('A disk is missing') }
	}
	if (last.sync && !last.sync.ok) {
		return last.sync.blocked ? { type: 'is-warning', text: t('Sync held back') } : { type: 'is-danger', text: t('The last sync failed') }
	}
	if (last.scrub && !last.scrub.ok) {
		return { type: 'is-danger', text: t('The last check found a problem') }
	}
	if (!snapraidWhen(last.sync && last.sync.at)) {
		return { type: 'is-warning', text: t('Not synced yet') }
	}
	return { type: 'is-success', text: t('Protected') }
}
