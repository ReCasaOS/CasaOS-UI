export function apiErrorMessage(error) {
	return error?.response?.message ?? error
}

export function emptyCloudOnError(error) {
	console.log(apiErrorMessage(error))
	return []
}
