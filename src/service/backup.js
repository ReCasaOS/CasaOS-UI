import { api } from './service.js'

const PREFIX = '/v2/app_management'

const backup = {
	// The names of the destinations this box knows. Names only: what a destination
	// needs to be reached stays in rclone's config and is never read back out.
	getDestinations() {
		return api.get(`${PREFIX}/backup/destinations`)
	},

	// `backend` is an rclone backend name -- s3, sftp, ftp -- and `parameters` are
	// that backend's own options, passed through untouched.
	// `encrypt` puts rclone's crypt backend on top: names and contents are
	// ciphertext before they leave this box. The password is kept by rclone and
	// never comes back; losing it loses every backup at that destination.
	saveDestination(name, backend, parameters, encrypt = false, password = '') {
		return api.put(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}`, {
			backend,
			parameters,
			encrypt,
			password: encrypt ? password : undefined,
		})
	},

	// Removes the way in, not the backups already sent there.
	deleteDestination(name) {
		return api.delete(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}`)
	},

	// Asked when somebody configures a destination rather than at 3am by a
	// scheduled job nobody is watching.
	checkDestination(name) {
		return api.post(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/check`)
	},

	// The standing arrangements.
	getSchedules() {
		return api.get(`${PREFIX}/backup/schedules`)
	},

	// The whole list at once, which is how the screen that edits it works. A
	// schedule's last_run is not sent: the server keeps it, and losing it would
	// make every schedule fire again at the next tick.
	saveSchedules(schedules) {
		return api.put(`${PREFIX}/backup/schedules`, schedules)
	},

	// What happened, newest first, failures included.
	getRuns() {
		return api.get(`${PREFIX}/backup/runs`)
	},

	// Returns as soon as the copy has started; it takes as long as it takes.
	// `holdStill` stops the app for the length of the copy -- leaving it running
	// takes a copy that may not restore.
	backupApp(id, destination, holdStill) {
		return api.post(`${PREFIX}/compose/${encodeURIComponent(id)}/backup`, {
			destination,
			hold_still: holdStill,
		})
	},

	// Puts the app back the way the backup at `stamp` had it. Returns as soon as
	// it has started; the outcome lands in the run log, marked as a restore. The
	// app is stopped for the copy, and files added since the backup are removed:
	// a restore means "as it was". An app that is not installed is installed
	// first, from the compose file the backup holds.
	restore(destination, app, stamp) {
		return api.post(`${PREFIX}/backup/restore`, { destination, app, stamp })
	},

	// What a destination holds: the apps it has backups of, their runs newest
	// first, and whether this box runs each app now. For a box whose own run
	// log is empty.
	getDestinationRuns(name) {
		return api.get(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/runs`)
	},

	// Removes one backup from the destination. The run log keeps its record.
	deleteRun(name, app, stamp) {
		return api.delete(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/runs/${encodeURIComponent(app)}/${encodeURIComponent(stamp)}`)
	},
}

export default backup
