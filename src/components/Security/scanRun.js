// What the two Security windows share: asking for a scan and waiting for its end. The component
// has a `load()` that reads what it shows, and calls `wait()` from it when a scan runs already.
import { refresh, vulnScanApi } from '@/service/vulnScan'

const POLL_MS = 5000

export default {
	data() {
		return {
			status: null,
			error: false,
			scanning: false,
			timer: null,
		}
	},

	beforeUnmount() {
		clearTimeout(this.timer)
	},

	methods: {
		async scan() {
			this.scanning = true
			try {
				await vulnScanApi.scan()
			} catch (e) {
				// 409: a scan runs already, the night's or another window's: wait for that one
				if (e?.response?.status !== 409) {
					this.scanning = false
					this.error = true
					return
				}
			}
			this.wait()
		},

		// asks every five seconds until the scan is over, then reads what it found
		wait() {
			this.scanning = true
			clearTimeout(this.timer)
			this.timer = setTimeout(async () => {
				try {
					const status = (await vulnScanApi.status()).data.data
					if (status?.running) {
						this.wait()
						return
					}
				} catch {
					this.scanning = false
					this.error = true
					return
				}
				this.scanning = false
				refresh({ force: true })
				this.load()
			}, POLL_MS)
		},
	},
}
