/*
 * @LastEditors: Jerryk jerry@icewhale.org
 * @LastEditTime: 2023-02-12 18:32:17
 * @FilePath: \CasaOS-UI-0.4.2\src\mixins\app\Business_OpenThirdApp.js
 * @Description:
 *
 * Copyright (c) 2022 by IceWhale, All Rights Reserved.
 */

import escape from 'lodash/escape'
import events from '@/events/events'
import { shouldOpenInNewWindow } from '@/mixins/app/appLaunchPreference'
import { frameRefused } from '@/mixins/app/frameCheck'
import { webScheme } from '@/mixins/app/webScheme'

export default {
	methods: {
		// The exception list used to be hardcoded here. It is now a setting, so an
		// app that will not render in a frame can be excepted without a release.
		shouldOpenInNewWindow(appInfo) {
			return shouldOpenInNewWindow(appInfo, {
				inIframe: this.$store.state.appLaunchInIframe,
				exceptions: this.$store.state.appLaunchExceptions,
			})
		},
		// An app says where its web interface is with a published port or an index. The
		// grid fills one in from the ports Docker reports when the compose file names
		// none, so reaching here means there was nothing to fill in either. A
		// stack written by hand says neither, and the URL built from nothing came out
		// as `http://<the box>` -- the dashboard itself, opened inside the dashboard.
		// Having nothing to open is an answer, and saying so beats opening the wrong
		// thing.
		hasWebUI(appInfo) {
			return Boolean(appInfo.port || appInfo.index)
		},
		warnNothingToOpen(appInfo) {
			this.$buefy.toast.open({
				message: escape(this.$t('{name} has no web interface to open. If it has one, set its port under Settings › Web UI.', { name: appInfo.name })),
				type: 'is-warning',
				position: 'is-top',
				duration: 4000,
			})
		},
		openAppToNewWindow(appInfo) {
			if (!this.hasWebUI(appInfo)) {
				this.warnNothingToOpen(appInfo)
				return
			}
			this.hasNewTag(appInfo.name) ? this.firstOpenThirdApp(appInfo) : this.openThirdApp(appInfo)
		},
		openThirdApp(appInfo) {
			this.$messageBus('apps_open', appInfo.name)
			if (appInfo.hostname !== '' || appInfo.port !== '' || appInfo.index !== '') {
				const hostIp = appInfo.hostname || this.$baseIp
				const scheme = webScheme(appInfo.scheme)
				const port = appInfo.port ? `:${appInfo.port}` : ''
				const index = appInfo.index || ''
				const url = `${scheme}://${hostIp}${port}${index}`

				// an app the box already found refusing a frame goes to a tab (frameCheck.js)
				if (this.shouldOpenInNewWindow(appInfo) || frameRefused(url)) {
					window.open(url, '_blank')
					this.$EventBus.$emit(events.CLOSE_APP_IFRAME)
					return
				}

				this.$EventBus.$emit(events.OPEN_APP_IFRAME, {
					name: appInfo.name,
					url,
				})
			}
		},
		async openThirdContainerByAppInfo(appInfo) {
			try {
				await this.$openAPI.appManagement.compose.setComposeAppStatus(appInfo.id, 'start')

				const allinfo = await this.$openAPI.appManagement.compose.myComposeApp(appInfo.id).then((res) => {
					return res.data.data
				})

				const containerInfoV2 = allinfo.store_info
				const app = {
					id: appInfo.id,
					name: appInfo.id,
					scheme: containerInfoV2.scheme,
					hostname: containerInfoV2.hostname || this.$baseIp,
					port: containerInfoV2.port_map,
					index: containerInfoV2.index,
					image: allinfo.compose.services[appInfo.id].image,
				}

				if (!allinfo.status.includes('running')) {
					await this.$openAPI.appManagement.compose.setComposeAppStatus(allinfo.compose.name, 'start')
					this.firstOpenThirdApp(app)
				} else {
					this.openAppToNewWindow(app)
				}
			} catch (e) {
				console.error(e)
			}
		},
		firstOpenThirdApp(appInfo) {
			this.removeIdFromSessionStorage(appInfo.name)
			// the launcher exists to wait for a URL to answer; with no URL it would
			// wait on nothing
			if (!this.hasWebUI(appInfo)) {
				this.warnNothingToOpen(appInfo)
				return
			}
			this.$EventBus.$emit(events.OPEN_APP_LAUNCHER, appInfo)
		},
	},
}
