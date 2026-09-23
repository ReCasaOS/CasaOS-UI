import { api } from './service.js'

const PREFIX = '/v2/app_management/git'

// Apps deployed from their own git repository (AppManagement, design of
// 2026-09-16). Hand-written like updates.js: the generated client lags the spec,
// and regenerating it rewrites thousands of lines. Every answer that carries an
// app is `{ data: GitApp }`; every error is `{ message }`.
const gitApps = {
	// `{ name, url, branch?, follow?, tag_pattern?, prereleases?, access, token? }`.
	// Registers the app without cloning it; in key mode the answer carries the
	// public key to add to the repository. `follow` is "branch" (absent) or "tags";
	// an AppManagement older than tags ignores the three tag fields.
	create(body) {
		return api.post(PREFIX, body)
	},

	// 404 when the app is neither registered nor adoptable.
	get(app) {
		return api.get(`${PREFIX}/${encodeURIComponent(app)}`)
	},

	// Any of `{ branch, follow, tag_pattern, prereleases, auto_deploy, access,
	// token, webhook_enabled, regenerate_webhook_secret }`. Adopts an adoptable
	// app. Regenerating the secret of a webhook that is off answers 400.
	update(app, body) {
		return api.put(`${PREFIX}/${encodeURIComponent(app)}`, body)
	},

	// Answers 202 as the check starts, with `operation.kind` "check"; `get` says
	// when it has ended (checkEnded in components/Apps/gitApps.js). Asks the remote,
	// clones an app registered and not cloned yet, adopts an adoptable one.
	check(app) {
		return api.post(`${PREFIX}/${encodeURIComponent(app)}/check`)
	},

	// Answers 202 as the deployment starts, and adopts an adoptable app.
	// `{ commit?, tag?, env? }`: neither commit nor tag is the remote's latest (the
	// highest eligible tag for an app that follows tags), a commit from the history
	// is a revert, a tag is that tag, lower ones included; both at once is a 400.
	// `env` only while no deployment has succeeded.
	deploy(app, body = {}) {
		return api.post(`${PREFIX}/${encodeURIComponent(app)}/deploy`, body)
	},

	// `{ data: [{ name, commit }] }`: the eligible tags of the remote, highest
	// first, at most 50. Asks the remote like a check does; 400 for an app that
	// follows a branch.
	tags(app) {
		return api.get(`${PREFIX}/${encodeURIComponent(app)}/tags`)
	},

	// Removes an app no deployment has succeeded for, with whatever a failed one
	// left; 409 once one has.
	remove(app) {
		return api.delete(`${PREFIX}/${encodeURIComponent(app)}`)
	},
}

export default gitApps
