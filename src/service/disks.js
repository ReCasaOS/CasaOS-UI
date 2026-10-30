/*
 * @Author: JerryK
 * @Date: 2021-09-18 21:32:13
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2022-08-11 17:16:42
 * @Description: Disk API
 * @FilePath: \CasaOS-UI\src\service\disks.js
 */
import { api } from './service.js'

const PREFIX = '/disks'
const disks = {

	// get disk list
	getDiskList(data) {
		return api.get(`${PREFIX}`, data)
	},

	umount(data) {
		return api.delete(`${PREFIX}`, data)
	},

	// Get usbs
	getUsbs() {
		return api.get(`${PREFIX}/usb`)
	},

	// Umount usb
	umountUsb(data) {
		return api.delete(`${PREFIX}/usb`, data)
	},

	// the software RAID arrays and their state (LocalStorage reads them from sysfs)
	raid() {
		return api.get(`${PREFIX}/raid`)
	},

	// erases the blank disks (their paths), makes one array of them at level (raid1, raid5, raid6, raid10), formats it
	// and mounts it as the storage name; confirm is that name typed again. Formatting can be long, hence the 10 minutes
	createRaid(name, level, disks, confirm, acceptDataLoss = false) {
		return api.post(`${PREFIX}/raid`, { name, level, disks, confirm, accept_data_loss: acceptDataLoss }, { timeout: 600000 })
	},

	// erases the blank disk at path and adds it to the array name; confirm is its name typed again
	addToRaid(name, path, confirm) {
		return api.post(`${PREFIX}/raid/${encodeURIComponent(name)}/disks`, { path, confirm })
	},

	// takes the failed member (sdc1) out of the array name
	removeFromRaid(name, member) {
		return api.delete(`${PREFIX}/raid/${encodeURIComponent(name)}/disks/${encodeURIComponent(member)}`)
	},
}
export default disks
