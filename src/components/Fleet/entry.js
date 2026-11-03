// What the rest of the dashboard knows about the fleet: whether this box is a master, the card that stands
// for the fleet in the app grid, and how to open the page. The page itself is loaded on demand.
import { defineAsyncComponent } from 'vue'
import fleetIcon from '@/assets/img/app/fleet.svg'
import { openWithEscape } from '@/components/VirtualMachines/modalStack'
import { FLEET_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'

const FleetPage = defineAsyncComponent(() => import('./FleetPage.vue'))

let probe = null

// The name of the card in the app grid, which also keeps its place in the saved order.
export const FLEET_APP_NAME = 'Fleet'

// The card itself, a system app like Statistics, shown only where the core says master.
export function fleetApplication() {
	return {
		id: 'fleet',
		name: FLEET_APP_NAME,
		title: { en_us: 'Fleet' },
		icon: fleetIcon,
		status: 'running',
		app_type: 'system',
	}
}

// Whether this box is the master of a fleet. Asked once, until the role changes (forgetFleet). A core without
// the route (404) is not one, and is not asked again; any other failure is asked again next time.
export function hasFleet() {
	if (!probe) {
		// the HTTP client is loaded here, not at the top: the app grid imports this file
		probe = import('@/service/fleet').then(({ fleetApi }) => fleetApi.status()).then(res => res?.data?.data?.role === 'master').catch((e) => {
			if (e?.response?.status !== 404) {
				probe = null
			}
			return false
		})
	}
	return probe
}

export function forgetFleet() {
	probe = null
}

// Opens the page in a modal, or on a tab of its own when the App launching setting sends apps, or this one,
// to a new tab. A window already on screen is the one to use.
export function openFleet(buefy, state) {
	const open = document.querySelector('.fleet-modal.is-active .fleet-page')
	if (open && !builtinOpensInNewTab(FLEET_LAUNCH_ID, state)) {
		open.querySelector('h3')?.focus({ preventScroll: true })
		return null
	}

	if (builtinOpensInNewTab(FLEET_LAUNCH_ID, state)) {
		window.open(`${window.location.pathname}#/fleet`, '_blank')
		return null
	}

	return openWithEscape(buefy, {
		component: FleetPage,
		hasModalCard: true,
		trapFocus: true,
		scroll: 'keep',
		animation: 'zoom-in',
		customClass: 'fleet-modal',
	})
}
