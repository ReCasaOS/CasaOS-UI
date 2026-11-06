/*
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-07-27 13:49:25
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2022-07-27 13:55:00
 * @FilePath: /CasaOS-UI/src/service/samba.js
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
 */
import { api } from './service.js'

const PREFIX = '/samba'
const samba = {
	//  Connections
	// get the list of samba connections
	getConnections() {
		return api.get(`${PREFIX}/connections`)
	},

	// create a connection
	createConnection(data) {
		return api.post(`${PREFIX}/connections`, data)
	},

	// Delete a connection
	deleteConnection(id) {
		return api.delete(`${PREFIX}/connections/${id}`)
	},

	// Shares
	// get share list
	getShares() {
		return api.get(`${PREFIX}/shares`)
	},

	// create a share
	createShare(data) {
		return api.post(`${PREFIX}/shares`, data)
	},

	// change who can open a share: members is [{ username, read_only }], and an
	// empty list hands it back to guests
	updateShare(id, data) {
		return api.put(`${PREFIX}/shares/${id}`, data)
	},

	// delete a share
	deleteShare(id) {
		return api.delete(`${PREFIX}/shares/${id}`)
	},

	// Share accounts
	// These are separate from CasaOS logins: Samba keeps its own password
	// database and cannot use the web credentials.

	// get the share accounts CasaOS created
	getUsers() {
		return api.get(`${PREFIX}/users`)
	},

	// create a share account
	createUser(data) {
		return api.post(`${PREFIX}/users`, data)
	},

	// change the password of a share account
	setUserPassword(username, password) {
		return api.put(`${PREFIX}/users/${encodeURIComponent(username)}/password`, { password })
	},

	// set the protected shares an account may open: [{ id, read_only }]; shares
	// left out lose the account
	setUserShares(username, shares) {
		return api.put(`${PREFIX}/users/${encodeURIComponent(username)}/shares`, shares)
	},

	// delete a share account
	deleteUser(username) {
		return api.delete(`${PREFIX}/users/${encodeURIComponent(username)}`)
	},
}
export default samba
