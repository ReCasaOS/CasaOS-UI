// What the rest of the dashboard knows about virtual machines: whether the
// module is there, the app card that stands for them next to Files, and how to
// open the page. Everything else stays in this folder, loaded on demand.
import { defineAsyncComponent } from 'vue'
import { openWithEscape } from './modalStack'
import { VMS_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'

// loaded when first opened: a box without the module never downloads the page
const VmPage = defineAsyncComponent(() => import('./VmPage.vue'))

let probe = null

// The name of the card in the app grid, which also keeps its place in the
// saved order.
export const VM_APP_NAME = 'Virtual Machines'

// The card itself, a system app like App Store and Files, shown only where the
// module answers. Built when asked for, so that importing this file does not
// load the icon.
export function vmApplication() {
	return {
		id: 'virtual-machines',
		name: VM_APP_NAME,
		title: {
			en_us: 'Virtual Machines',
		},
		icon: require('@/assets/img/app/vms.svg'),
		status: 'running',
		app_type: 'system',
	}
}

// Whether the virtual machine module (CasaOS-VirtManagement) answers through
// the gateway. Asked once per page load: the module does not come and go.
export function hasVirtualMachines() {
	if (!probe) {
		// the HTTP client is loaded here, not at the top: the app grid imports this
		// file, and should not pull in the client and the store with it
		probe = import('@/service/service.js').then(({ api }) => api.get('/v2/virt_management/host')).then(() => true).catch((e) => {
			// asked again next time unless the module is plainly not there
			if (e.response?.status !== 404) {
				probe = null
			}
			return false
		})
	}
	return probe
}

// Opens the page in a modal, or on a tab of its own when the App launching
// setting sends apps, or this one, to a new tab.
export function openVirtualMachines(buefy, state) {
	if (builtinOpensInNewTab(VMS_LAUNCH_ID, state)) {
		window.open(`${window.location.pathname}#/vms`, '_blank')
		return null
	}

	return openWithEscape(buefy, {
		component: VmPage,
		hasModalCard: true,
		trapFocus: true,
		scroll: 'keep',
		animation: 'zoom-in',
		customClass: 'vm-modal',
	})
}
