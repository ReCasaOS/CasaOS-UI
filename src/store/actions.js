/*
 * @Author: Jerryk jerry@icewhale.org
 * @Date: 2022-06-02 19:50:08
 * @LastEditors: zhanghengxin ezreal.ice@icloud.com
 * @LastEditTime: 2022-08-30 16:16:32
 * @FilePath: /CasaOS-UI/src/store/actions.js
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
 */

import $api from '@/service/api.js'

const actions = {
	// GET_HARDWARE_INFO(context, val) {
	//     context.commit("GET_HARDWARE_INFO",val)
	// },
	// set shortcut data: the sidebar's Starred list, folders and files
	async SET_SHORTCUT_DATA(context, val) {
		try {
			// new objects, so the list in the store is not changed before the save answers
			const shortcuts = val.map((item) => {
				const type = item.type === 'file' ? 'file' : 'folder'
				return { ...item, type, icon: type === 'file' ? 'files-outline' : 'folder', pack: 'casa', visible: true, selected: true, extensions: null }
			})
			const data = await $api.users.saveShutcutDetail(shortcuts).then(v => v.data.data)
			context.commit('SET_SHORTCUT_DATA', data)
		} catch (e) {
			console.log(e)
		}
	},

	// get shortcut data
	async GET_SHORTCUT_DATA(context, val) {
		try {
			let data = await $api.users.getShutcutDetail(val).then(v => v.data.data)
			if (!data) {
				data = []
			}
			context.commit('SET_SHORTCUT_DATA', data)
		} catch (e) {
			console.log(e)
		}
	},

}
export default actions
