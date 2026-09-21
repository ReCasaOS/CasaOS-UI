// Options for vue-dompurify-html, shared by main.js and the specs.
export const dompurifyOptions = {
	default: {
		ALLOWED_ATTR: ['target', 'href'],
	},
	namedConfigurations: {
		// Markdown rendered by marked: app store descriptions and tips. DOMPurify's own
		// allow-list keeps what markdown produces (<img src>, table alignment...); style
		// is dropped so a description cannot restyle or cover the dashboard.
		markdown: {
			FORBID_ATTR: ['style'],
		},
	},
}
