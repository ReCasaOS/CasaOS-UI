import { api } from './service.js'

const PREFIX = '/users'
const PREFIX2 = '/v2/users'

const users = {
	// get all user name [OK]
	getAllUserName() {
		return api.get(`${PREFIX}/name`)
	},

	// delete all user [NOT USE]
	deleteAllUser() {
		return api.delete(`${PREFIX}`)
	},
	// get user status [OK]
	getUserStatus() {
		return api.get(`${PREFIX}/status`)
	},
	// the login page the whole box shows: 'classic' or 'beta'; status says it
	setLoginStyle(style) {
		return api.put(`${PREFIX}/login-style`, { style })
	},

	// get user current info [OK]
	getUserInfo() {
		return api.get(`${PREFIX}/current`)
	},
	// set user current info [OK]
	setUserInfo(data) {
		return api.put(`${PREFIX}/current`, data)
	},
	// change user password [OK]
	changePassword(data) {
		return api.put(`${PREFIX}/current/password`, data)
	},

	getLinkAppDetail() {
		return api.get(`${PREFIX}/current/custom/link`)
	},

	saveLinkAppDetail(data) {
		return api.post(`${PREFIX}/current/custom/link`, data)
	},

	// delete user [NOT USE]
	deleteUser(id) {
		return api.delete(`${PREFIX}/${id}`)
	},

	// get user image [NOT USE]
	getUserImage(path) {
		return api.get(`${PREFIX}/image`, {
			path,
		})
	},

	// create or update user image from upload
	setUserImage(key, data) {
		return api.put(`${PREFIX}/current/image/${key}`, data)
	},

	// upload a user image from the browser, as <key>.<ext> in the user's
	// folder [login wallpaper]
	uploadUserImage(key, blob, fileName) {
		const form = new FormData()
		form.append('file', blob, fileName)
		return api.post(`${PREFIX}/current/image/${key}`, form, {
			headers: { 'Content-Type': 'multipart/form-data' },
		})
	},

	// delete one of the user's images, by its path [login wallpaper]
	removeUserImage(path) {
		// the path goes in the query: api.delete sends its second argument as a body
		return api.delete(`${PREFIX}/current/image?path=${encodeURIComponent(path)}`)
	},

	// delete user image [NOT USE]
	deleteUserImage(path) {
		return api.delete(`${PREFIX}/current/image`, {
			path,
		})
	},

	// get custom storage [OK]
	// free store GET
	getCustomStorage(key) {
		return api.get(`${PREFIX}/current/custom/${key}`)
	},

	// set or update custom storage  [OK]
	// free store POST
	setCustomStorage(key, data) {
		return api.post(`${PREFIX}/current/custom/${key}`, data)
	},

	// delete custom storage  [NOT USE]
	deleteCustomStorage(key) {
		return api.delete(`${PREFIX}/current/custom/${key}`)
	},

	// get user info by user name  [NOT USE]
	getUserInfoByName(username) {
		return api.get(`${PREFIX}/${username}`)
	},

	// register [OK]
	register(username, password, key) {
		return api.post(`${PREFIX}/register`, {
			username,
			password,
			key,
		})
	},

	// login [OK]
	login(username, password) {
		return api.post(`${PREFIX}/login`, {
			username,
			password,
		})
	},

	// two-factor authentication
	setup2FA(data) {
		return api.post(`${PREFIX}/2fa/setup`, data)
	},

	enable2FA(data) {
		return api.post(`${PREFIX}/2fa/enable`, data)
	},

	disable2FA(data) {
		return api.post(`${PREFIX}/2fa/disable`, data)
	},

	verify2FA(data) {
		return api.post(`${PREFIX}/2fa/verify`, data)
	},

	// refresh token [OK]
	refreshToken(refresh_token) {
		return api.post(`${PREFIX}/refresh`, {
			refresh_token,
		})
	},

	// get shutcut [OK]
	getShutcutDetail() {
		return api.get(`${PREFIX}/current/custom/shortcut`)
	},

	// save shutcut [OK]
	saveShutcutDetail(data) {
		return api.post(`${PREFIX}/current/custom/shortcut`, data)
	},

	// get user letter [OK]
	getLetter() {
		return api.get(`${PREFIX2}/events`)
	},

	// delete letter [OK]
	delLetter(uuid) {
		return api.delete(`${PREFIX2}/event/${uuid}`)
	},

	// save user avatar
	saveAvatar(data) {
		return api.put(`${PREFIX}/avatar`, data)
	},

}

export default users
