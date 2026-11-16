// The sentences on a scheduled folder sync card. Pure: `t` is the component's $t, and
// every text is its own English key.

import { whenOf } from './backupScheduleGroups.js'
import { renderSize } from '@/mixins/file_utils'

const ARROWS = { download: '→', upload: '←', both: '↔' }

// Cloud side first, then the box, whichever way the files go.
export function routeOf(task) {
	return `${task.destination} /${String(task.remote_path).replace(/^\/+/, '')} ${ARROWS[task.direction] || '↔'} ${task.local_path}`
}

function everyOf(task, t, locale) {
	const [hour = '00', minute = '00'] = String(task.at).split(':')
	if (task.every === 'hourly') {
		return t('Every hour at :{minute}', { minute })
	}
	if (task.every === 'weekly') {
		// 2023-01-01 was a Sunday, which is weekday 0
		const day = new Date(2023, 0, 1 + Number(task.weekday)).toLocaleDateString(locale, { weekday: 'long' })

		return t('Every week on {day} at {time}', { day, time: `${hour}:${minute}` })
	}

	return t('Every day at {time}', { time: `${hour}:${minute}` })
}

export function ruleOf(task, t, locale = 'en-US') {
	const parts = [everyOf(task, t, locale), task.mirror ? t('deletions are carried over') : t('nothing is ever deleted')]
	if (task.archive) {
		parts.push(task.archive_days > 0 ? t('copies kept {days} days', { days: task.archive_days }) : t('copies kept forever'))
	}

	return parts.join(' · ')
}

export function lastOf(task, t, now = new Date()) {
	if (!task.last_run || task.last_run.startsWith('0001')) {
		return t('never run')
	}
	if (task.last_result === 'failed') {
		return t('Last pass failed: {error}', { error: task.last_error })
	}
	const result = { ok: 'pass done', recovered: 'resumed after an interruption', stopped: 'stopped' }[task.last_result]
	const parts = [t('Last pass: {when}', { when: whenOf(new Date(task.last_run), t, now) })]
	if (result) {
		parts.push(t(result))
	}
	// a pass whose figures the box did not give is not "0 files, 0 B"
	if (task.last_files || task.last_bytes) {
		parts.push(t('{count} files', { count: task.last_files || 0 }), renderSize(task.last_bytes || 0))
	}

	return parts.join(', ')
}

// One notice at most: a task that must be put right first, then deletions to confirm, then an FYI.
export function noticeOf(task, t) {
	if (task.needs_first_pass) {
		return { kind: 'first-pass', text: t('This task lost track of the two sides') }
	}
	if (task.needs_delete_confirm) {
		return { kind: 'deletes', text: t('More than half of the files on one side are gone') }
	}
	if (task.last_result === 'recovered') {
		return { kind: 'recovered', text: t('Resumed after an interruption: files deleted since may have come back') }
	}

	return null
}

// The settings entry shows unless the box says it has no such call (an older App Management).
export function syncAvailable(error) {
	const { status, data } = error?.response || {}

	// an older App Management's request validator answers an unknown route with a 400
	return !(status === 404 || (status === 400 && typeof data?.message === 'string' && data.message.includes('no matching operation')))
}
