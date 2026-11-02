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

	// erases the blank disk at path and changes the RAID 1 name to a RAID 5 of three disks with it; confirm is the disk's name typed again.
	// The call ends when the reshape has started; it goes on in the background
	raidToRaid5(name, path, confirm) {
		return api.post(`${PREFIX}/raid/${encodeURIComponent(name)}/level`, { level: 'raid5', path, confirm }, { timeout: 600000 })
	},

	// makes the filesystem on the array name take all the room the array has (after a reshape); it can take minutes
	growRaidFilesystem(name) {
		return api.post(`${PREFIX}/raid/${encodeURIComponent(name)}/filesystem`, {}, { timeout: 600000 })
	},

	// SnapRAID: how the protection of the merged storage stands (set up or not, the action at work, how each ended)
	snapraid() {
		return api.get(`${PREFIX}/snapraid`)
	},

	// protects the pool (its mount point) with the storages at parity (one or two mount points)
	setSnapraid(pool, parity) {
		return api.put(`${PREFIX}/snapraid`, { pool, parity })
	},

	// the same with the storages at data (their mount points) in place of a pool, for disks that are not merged yet; nothing is written to the disks
	protectDisks(data, parity) {
		return api.put(`${PREFIX}/snapraid`, { data, parity })
	},

	// forgets the protection; the parity files stay where they are
	removeSnapraid() {
		return api.delete(`${PREFIX}/snapraid`)
	},

	// starts diff, sync, scrub or fix in the background (202); options: { force } for sync, { full } for scrub, { disk, confirm } for fix
	runSnapraid(action, options = {}) {
		return api.post(`${PREFIX}/snapraid/${action}`, options)
	},

	// interrupts the action at work; SnapRAID saves where it was
	stopSnapraid() {
		return api.delete(`${PREFIX}/snapraid/job`)
	},

	// takes the failed member (sdc1) out of the array name
	removeFromRaid(name, member) {
		return api.delete(`${PREFIX}/raid/${encodeURIComponent(name)}/disks/${encodeURIComponent(member)}`)
	},

	// unmounts the array name, stops it and erases the RAID header of its disks, which read blank after; confirm is the name typed again
	deleteRaid(name, confirm) {
		return api.delete(`${PREFIX}/raid/${encodeURIComponent(name)}`, { confirm })
	},
}
export default disks
