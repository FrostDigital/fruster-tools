module.exports = {

	matchPattern: function(str, pattern = "") {
		if (pattern.indexOf("*") > -1) {
			return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
		} else {
			return str == pattern.trim();
		}
	},

	capitalize: ([first,...rest]) => {
		return first.toUpperCase() + rest.join("").toLowerCase();
	}	
};

