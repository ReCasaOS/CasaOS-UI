import { instance } from './service.js'

// The files of a running container, read by the box from the host: read only, the owner's.
const base = id => `/v2/app_management/container/${encodeURIComponent(id)}/files`

const containerFiles = {
	list(id, path) {
		return instance.get(base(id), { params: { path } })
	},

	content(id, path) {
		return instance.get(`${base(id)}/content`, { params: { path } })
	},

	// the browser fetches it itself, to the disk as it comes: the token rides in the query
	downloadUrl(id, path, token) {
		return `${base(id)}/download?${new URLSearchParams({ path, token })}`
	},
}

export default containerFiles
