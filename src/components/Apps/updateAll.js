// The words of the update-every-app dialog, kept out of the component so they can
// be checked without mounting it.

// One line per service of the plan: what the image moves to, or that a newer
// build of the same tag is waiting.
export function describeService(app, service) {
	if (app.kind === 'catalogue' && service.from !== service.to) {
		return { message: '{service}: {from} → {to}', params: { service: service.name, from: service.from, to: service.to } }
	}

	return { message: '{service}: a newer build of {image}', params: { service: service.name, image: service.from } }
}

// Where a run stands: how many are done, and what became of them once it is over.
export function runSummary(run) {
	const apps = (run && run.apps) || []
	const count = state => apps.filter(app => app.state === state).length
	const done = count('updated') + count('current') + count('failed')

	if (!run || !run.finished_at) {
		return { message: '{done} of {total} done', params: { done, total: apps.length } }
	}

	return {
		message: 'Done: {updated} updated, {current} already current, {failed} failed.',
		params: { updated: count('updated'), current: count('current'), failed: count('failed') },
	}
}

export const STATE_LABELS = {
	queued: 'waiting',
	updating: 'updating…',
	updated: 'updated',
	current: 'already current',
	failed: 'failed',
}
