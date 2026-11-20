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

	download(id, path) {
		return instance.get(`${base(id)}/download`, { params: { path }, responseType: 'blob', timeout: 0 })
	},
}

export default containerFiles
