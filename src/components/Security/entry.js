// What the rest of the dashboard knows about the vulnerability scans (the optional module
// ReCasaOS-VulnScan): whether the module is there, its card in the app grid, and how to open its
// window. The window itself is loaded on demand.
import { defineAsyncComponent } from 'vue'
import { openWithEscape } from '@/components/VirtualMachines/modalStack'

const SecurityOverview = defineAsyncComponent(() => import('./SecurityOverview.vue'))

// The name of the card in the app grid, which also keeps its place in the saved order. The
// capital keeps it apart from an app: a compose project is in lower case.
export const SECURITY_APP_NAME = 'Security'

let probe = null

// a module that does not answer within this is asked again later (AppSection), not waited for
const PROBE_MS = 15000

// Whether the module answers through the gateway: true, false where it is plainly not there
// (404), null where it did not answer for now (a refusal, a 5xx, no answer in time). Asked
// once, until a module is installed or removed (forgetSecurity); a null is asked again next
// time. Its routes are the administrator's: ask for that account only.
export function hasSecurity() {
	if (!probe) {
		// the HTTP client is loaded here, not at the top: the app grid imports this file
		probe = import('@/service/vulnScan').then(({ vulnScanApi }) => vulnScanApi.status({ timeout: PROBE_MS })).then(() => true).catch((e) => {
			if (e.response?.status === 404) {
				return false
			}
			probe = null
			return null
		})
	}
	return probe
}

export function forgetSecurity() {
	probe = null
}

export function securityApplication() {
	return {
		id: 'security',
		name: SECURITY_APP_NAME,
		title: { en_us: 'Security' },
		icon: require('@/assets/img/app/security.svg'),
		status: 'running',
		app_type: 'system',
	}
}

// shortcut: always a window, the App launching setting does not send it to a tab; add it there if asked
export function openSecurity(buefy) {
	return openWithEscape(buefy, {
		component: SecurityOverview,
		hasModalCard: true,
		trapFocus: true,
		scroll: 'keep',
		animation: 'zoom-in',
		customClass: 'security-modal',
	})
}
