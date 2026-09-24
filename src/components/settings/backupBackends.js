/**
 * The fields each backend usually wants, and nothing more.
 *
 * These are suggestions, not a schema. rclone decides what a backend needs and
 * gains options between releases; a closed list maintained here would be wrong the
 * first time that happened, and would stop someone configuring a backend this file
 * has never heard of. So picking a backend fills the key names in and the rows
 * stay editable, including the ones nobody suggested.
 *
 * Field names are rclone's own, which is the point of showing them: `access_key_id`
 * rather than `aws_access_key_id` is the difference between a destination that
 * works and an afternoon.
 */
export const BACKUP_BACKENDS = [
	{
		id: 's3',
		label: 'S3 (Amazon, Backblaze, Wasabi, MinIO…)',
		fields: ['provider', 'access_key_id', 'secret_access_key', 'region', 'endpoint'],
	},
	{
		id: 'sftp',
		label: 'SFTP',
		fields: ['host', 'user', 'port', 'key_file', 'pass'],
	},
	{
		id: 'ftp',
		// Said plainly rather than hidden in documentation nobody opens: this one
		// sends the password and the files in the clear.
		label: 'FTP (unencrypted)',
		fields: ['host', 'user', 'port', 'pass'],
	},
	{
		id: 'webdav',
		label: 'WebDAV',
		fields: ['url', 'vendor', 'user', 'pass'],
	},
	// Signing in to these three takes a browser, which a box does not have: rclone
	// does it on a computer that has one, with its own app registration, and the
	// token it gives is pasted here. `help` says how, and is a language-file key.
	{
		id: 'onedrive',
		label: 'OneDrive',
		fields: ['token', 'drive_id', 'drive_type'],
		help: 'A box has no browser to sign in with. On a computer that has one, add a OneDrive remote with rclone config, then run rclone config show with its name and copy its token, drive_id and drive_type here.',
	},
	{
		id: 'drive',
		label: 'Google Drive',
		fields: ['token'],
		help: 'A box has no browser to sign in with. On a computer that has one, run rclone authorize "drive", sign in, and paste the token it prints.',
	},
	{
		id: 'dropbox',
		label: 'Dropbox',
		fields: ['token'],
		help: 'A box has no browser to sign in with. On a computer that has one, run rclone authorize "dropbox", sign in, and paste the token it prints.',
	},
]

/**
 * @param {string} id an rclone backend name
 * @returns {string} how to fill that backend in, a language-file key, or '' when the
 *   suggested fields say enough
 */
export function backendHelp(id) {
	const backend = BACKUP_BACKENDS.find(candidate => candidate.id === id)
	return (backend && backend.help) || ''
}

/**
 * @param {string} id an rclone backend name
 * @returns {{key: string, value: string}[]} one empty row per field that backend
 *   usually wants, or a single blank row for one nobody here has heard of
 */
export function suggestedFields(id) {
	const backend = BACKUP_BACKENDS.find(candidate => candidate.id === id)
	if (!backend)
		return [{ key: '', value: '' }]

	return backend.fields.map(key => ({ key, value: '' }))
}

/**
 * Drop the rows nobody filled in, so a suggestion the owner ignored is not sent as
 * an empty option -- rclone treats an empty value as a value, and an empty
 * `endpoint` is not the same as no endpoint.
 *
 * @param {{key: string, value: string}[]} rows
 * @returns {object} what to send as `parameters`
 */
export function parametersFrom(rows) {
	const parameters = {}

	for (const row of rows || []) {
		const key = (row.key || '').trim()
		if (key === '' || (row.value || '') === '')
			continue

		parameters[key] = row.value
	}

	return parameters
}
