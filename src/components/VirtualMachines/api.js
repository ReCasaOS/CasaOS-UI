// The virtual machine API (CasaOS-VirtManagement). Hand-written: a dozen routes
// do not need a generated client.
import { api } from '@/service/service.js'

const PREFIX = '/v2/virt_management'

const vmApi = {
	host() {
		return api.get(`${PREFIX}/host`)
	},
	list() {
		return api.get(`${PREFIX}/vms`)
	},
	get(id) {
		return api.get(`${PREFIX}/vms/${id}`)
	},
	create(data) {
		return api.post(`${PREFIX}/vms`, data)
	},
	update(id, data) {
		return api.patch(`${PREFIX}/vms/${id}`, data)
	},
	remove(id, deleteDisks) {
		return api.delete(`${PREFIX}/vms/${id}?delete_disks=${deleteDisks ? 'true' : 'false'}`)
	},
	// action: start, shutdown, reboot, force-off, reset, pause, resume
	action(id, action) {
		return api.post(`${PREFIX}/vms/${id}/${action}`)
	},
	// an empty path ejects
	setCDROM(id, isoPath) {
		return api.put(`${PREFIX}/vms/${id}/cdrom`, { iso_path: isoPath })
	},
	addDisk(id, sizeGiB) {
		return api.post(`${PREFIX}/vms/${id}/disks`, { size_gib: sizeGiB })
	},
	resizeDisk(id, target, sizeGiB) {
		return api.patch(`${PREFIX}/vms/${id}/disks/${target}`, { size_gib: sizeGiB })
	},
	// the whole list: those not in it go
	setPorts(id, ports) {
		return api.put(`${PREFIX}/vms/${id}/ports`, { ports })
	},
	// whether a folder can hold VM disks, and its free space
	storageFolder(path) {
		// api.get takes the query parameters themselves
		return api.get(`${PREFIX}/storage`, { path })
	},
	// the folder new VMs use
	setStorage(path) {
		return api.put(`${PREFIX}/host/storage`, { path })
	},
	downloads() {
		return api.get(`${PREFIX}/images/downloads`)
	},
	startDownload(url, sha256) {
		return api.post(`${PREFIX}/images/downloads`, sha256 ? { url, sha256 } : { url })
	},
	// cancels a running one, or takes a finished one off the list
	deleteDownload(id) {
		return api.delete(`${PREFIX}/images/downloads/${id}`)
	},
	hostUSB() {
		return api.get(`${PREFIX}/host/usb`)
	},
	// the whole list: those not in it are taken back
	setUSB(id, devices) {
		return api.put(`${PREFIX}/vms/${id}/usb`, { devices })
	},
	createSnapshot(id, name) {
		return api.post(`${PREFIX}/vms/${id}/snapshots`, { name })
	},
	revertSnapshot(id, snapshotId) {
		return api.post(`${PREFIX}/vms/${id}/snapshots/${snapshotId}/revert`)
	},
	deleteSnapshot(id, snapshotId) {
		return api.delete(`${PREFIX}/vms/${id}/snapshots/${snapshotId}`)
	},
	removeDisk(id, target, deleteFile) {
		return api.delete(`${PREFIX}/vms/${id}/disks/${target}?delete_file=${deleteFile ? 'true' : 'false'}`)
	},
	images() {
		return api.get(`${PREFIX}/images`)
	},
	// The console is a WebSocket, which cannot carry an Authorization header,
	// so the token goes in the query; the service accepts it on this route only.
	// It goes to the page's own host: in development that is the dev server,
	// whose proxy forwards it to the box (vue.config.js).
	consoleURL(wsProtocol, id) {
		const token = localStorage.getItem('access_token') || ''
		return `${wsProtocol}//${window.location.host}${PREFIX}/vms/${id}/console?token=${encodeURIComponent(token)}`
	},
}

export default vmApi
