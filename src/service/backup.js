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
	// `root` is where on the backend everything is put: a folder, or for s3 the
	// bucket. Without it an object store gets one bucket per app, named after the
	// app, which a provider where bucket names are shared by everyone refuses.
	saveDestination(name, backend, parameters, encrypt = false, password = '', root = '') {
		return api.put(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}`, {
			backend,
			parameters,
			encrypt,
			password: encrypt ? password : undefined,
			root: root.trim() || undefined,
		})
	},

	// A box has no browser: it runs `rclone authorize` and gives back the provider's
	// sign-in address. The provider then redirects to 127.0.0.1:53682, which does
	// not load on the person's computer; the address of that page goes to
	// signInFinish, which gives back the token for the destination.
	signIn(backend) {
		return api.post(`${PREFIX}/backup/signin`, { backend })
	},

	signInFinish(redirected) {
		return api.post(`${PREFIX}/backup/signin/finish`, { redirected })
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
	backupApp(id, destination, holdStill, keep = 0) {
		return api.post(`${PREFIX}/compose/${encodeURIComponent(id)}/backup`, {
			destination,
			hold_still: holdStill,
			// keep the last `keep` backups of this app here once this one has landed; zero keeps everything
			...(keep > 0 ? { keep } : {}),
		})
	},

	// Puts the app back the way the backup at `stamp` had it. Returns as soon as
	// it has started; the outcome lands in the run log, marked as a restore. The
	// app is stopped for the copy, and files added since the backup are removed:
	// a restore means "as it was". An app that is not installed is installed
	// first, from the compose file the backup holds.
	// `paths`, when there are any, put back only those paths of the backup -- as browse()
	// names them -- onto the app as it is, over what is there and deleting nothing.
	restore(destination, app, stamp, paths = []) {
		return api.post(`${PREFIX}/backup/restore`, { destination, app, stamp, ...(paths.length ? { paths } : {}) })
	},

	// One level inside a backup: the folders that lead to its copies at the top (an
	// empty `path`), then what each copy holds. Folders first.
	browse(name, app, stamp, path = '') {
		return api.get(
			`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/runs/${encodeURIComponent(app)}/${encodeURIComponent(stamp)}/files`,
			path ? { path } : undefined,
		)
	},

	// What a destination holds: the apps it has backups of, their runs newest
	// first, and whether this box runs each app now. For a box whose own run
	// log is empty.
	// Whether a destination keeps its backups with restic, and whether this box has it.
	getResticState(name) {
		return api.get(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/restic`)
	},

	// Switches a destination to restic. Without a password a repository is made and
	// its password comes back (getResticPassword reads it again later); with one, the destination is attached to the
	// repository already there.
	enableRestic(name, password = '') {
		return api.put(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/restic`, password ? { password } : {})
	},

	// The password of a destination's restic repository, read back from this box.
	getResticPassword(name) {
		return api.get(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/restic/password`)
	},

	// Sends the next backups of a destination back to rclone. Nothing is deleted: the
	// repository and its password stay, and what it holds is still listed and restored.
	// Enabling again, without a password, takes it up.
	disableRestic(name) {
		return api.delete(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/restic`)
	},

	// Checks the restic repository of a destination now, in the background: it is read
	// whole, so it ends when it ends. The result is `last_check` of the restic state.
	checkRestic(name) {
		return api.post(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/restic/check`)
	},

	getDestinationRuns(name) {
		return api.get(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/runs`)
	},

	// The box itself: its users, shares, schedules, destinations. Filed under
	// `casaos-system`, which the destination browser and History show as
	// "This box". The services holding those files are stopped for the copy.
	backupSystem(destination, holdStill = true) {
		return api.post(`${PREFIX}/backup/system`, { destination, hold_still: holdStill })
	},

	// Removes one backup from the destination. The run log keeps its record.
	deleteRun(name, app, stamp) {
		return api.delete(`${PREFIX}/backup/destinations/${encodeURIComponent(name)}/runs/${encodeURIComponent(app)}/${encodeURIComponent(stamp)}`)
	},
}

export default backup
