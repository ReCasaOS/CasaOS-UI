import { api } from './service.js'

const PREFIX = '/file'

const file = {

	// get file content
	getContent(path) {
		return api.get(`${PREFIX}/content`, {
			path,
			timestamp: Date.now(),
		})
	},

	// download single file
	download(path) {
		return api.get(`${PREFIX}`, {
			path,
			timestamp: Date.now(),
		})
	},

	// create file
	create(path) {
		return api.post(`${PREFIX}`, {
			path,
		})
	},

	// rename file
	rename(old_path, new_path) {
		return api.put(`${PREFIX}/name`, {
			old_path,
			new_path,
		})
	},

	// update file
	update(path, content) {
		return api.put(`${PREFIX}`, {
			path,
			content,
		})
	},

	// the trash of every disk: { items, size, retention_days }
	trash() {
		return api.get(`${PREFIX}/trash`)
	},

	// items are [{ trash, name }] as trash() gives them
	restoreTrash(items) {
		return api.post(`${PREFIX}/trash/restore`, items)
	},

	deleteTrash(items) {
		return api.delete(`${PREFIX}/trash`, items)
	},

	emptyTrash() {
		return api.delete(`${PREFIX}/trash/all`)
	},

}

export default file
