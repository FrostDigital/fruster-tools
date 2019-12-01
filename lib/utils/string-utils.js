module.exports = {
	matchPattern: function(str, pattern = "") {
		if (pattern.indexOf("*") > -1) {
			return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
		} else {
			return str == pattern.trim();
		}
	},

	capitalize: ([first, ...rest]) => {
		return first.toUpperCase() + rest.join("").toLowerCase();
	},

	/**
	 * @param {string} image
	 */
	parseImage: image => {
		const [imageName, imageTag] = image.split(":");

		return {
			imageName,
			imageTag
		};
	},

	/**
	 * @param {string} string
	 */
	isSemver: string => {
		return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/.test(
			string
		);
	}
};
