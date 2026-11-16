// The accounts an app is hidden from (AppManagement, admin only): both answers are read as res.data.data.hidden_for.
import { api } from './service.js'

const url = app => `/v2/app_management/visibility/${encodeURIComponent(app)}`

export const getVisibility = app => api.get(url(app))
export const setVisibility = (app, hiddenFor) => api.put(url(app), { hidden_for: hiddenFor })

// the entries of apps no longer installed (an uninstall keeps an app's entry: its logs, statistics and backups stay), read as res.data.data
export const listOrphans = () => api.get('/v2/app_management/visibility-orphans')
// drops an app's entry: what is left of it is then every account's to see
export const forgetApp = app => api.delete(url(app))

// whether the dashboard leaves the app's icon out, for every account (admin only): read as res.data.data.hidden
const dashboardUrl = app => `/v2/app_management/dashboard-hidden/${encodeURIComponent(app)}`
export const getDashboardHidden = app => api.get(dashboardUrl(app))
export const setDashboardHidden = (app, hidden) => api.put(dashboardUrl(app), { hidden })
