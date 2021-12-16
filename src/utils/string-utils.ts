export const matchPattern = (str: string, pattern = "") => {
	if (pattern.indexOf("*") > -1) {
		return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
	} else {
		return str == pattern.trim();
	}
};

export const capitalize = ([first, ...rest]: string[]) => {
	return first.toUpperCase() + rest.join("").toLowerCase();
};

/**
 * @param {string} image
 */
export const parseImage = (image: string) => {
	const [imageName, imageTag] = image.split(":");

	return {
		imageName,
		imageTag,
	};
};

/**
 * @param {string} string
 */
export const isSemver = (str: string) => {
	return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/.test(
		str
	);
};
