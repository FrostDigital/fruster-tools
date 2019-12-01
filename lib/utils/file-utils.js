const fs = require("fs-extra");
const path = require("path");
const json5 = require("json5");

module.exports = {
	/**
	 *
	 * @param {string} filePath
	 * @param {boolean} isJSON
	 */
	readFile: function(filePath, isJSON) {
		try {
			if (fs.lstatSync(filePath).isFile() || fs.lstatSync(filePath).isSymbolicLink()) {
				let fileContent = fs.readFileSync(filePath, "utf8");
				return isJSON ? json5.parse(fileContent) : fileContent;
			}
		} catch (ex) {
			return null;
		}
	},

	/**
	 *
	 * @param {string} filePath
	 * @param {boolean} allowSymLinks
	 */
	hasFile: function(filePath, allowSymLinks) {
		const stat = statSyncSafe(filePath);
		return (stat !== null && stat.isFile()) || (stat !== null && allowSymLinks && stat.isSymbolicLink());
	},

	/**
	 *
	 * @param {string} dirPath
	 * @param {boolean} allowSymLinks
	 */
	hasDir: function(dirPath, allowSymLinks) {
		const stat = statSyncSafe(dirPath);
		return (stat !== null && stat.isDirectory()) || (stat !== null && allowSymLinks && stat.isSymbolicLink());
	},

	/**
	 *
	 * @param {string} filePath
	 */
	getFilename(filePath) {
		let arr = filePath.split("/");
		return arr.pop();
	},

	/**
	 *
	 * @param {string} filePath
	 */
	getDirPath(filePath) {
		let absolutePath = path.resolve(filePath);
		let arr = absolutePath.split("/");
		arr.pop();
		return arr.join("/");
	}
};

/**
 *
 * @param {string} filePath
 */
function statSyncSafe(filePath) {
	try {
		return fs.lstatSync(filePath);
	} catch (ex) {
		return null;
	}
}
