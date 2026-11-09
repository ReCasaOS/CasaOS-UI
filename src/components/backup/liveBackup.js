// The figures of a backup that runs, as GET /backup/running gives them, for the dashboard card
// and the Running tab alike. They are the operation under way's: the box only knows a folder's
// total once it has gone through it.

import { SYSTEM_APP } from '../settings/backupScheduleGroups.js'

// percent is null while the total is not known: a bar then shows no fill rather than 0 %
export function liveFigures(backup) {
	const stats = (backup && backup.stats) || {}
	const totalBytes = stats.total_bytes || 0

	return {
		percent: totalBytes > 0 ? Math.floor((100 * (stats.bytes || 0)) / totalBytes) : null,
		bytes: stats.bytes || 0,
		totalBytes,
		files: stats.files || 0,
		totalFiles: stats.total_files || 0,
		speed: stats.speed || 0,
		eta: Number.isFinite(stats.eta) ? stats.eta : null,
	}
}

export function liveTitle(app, titleOf, t) {
	return app === SYSTEM_APP ? t('This box') : titleOf(app)
}
