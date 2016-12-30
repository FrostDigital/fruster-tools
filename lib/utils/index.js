const fs = require("fs");

module.exports = {

	matchPattern: function(str, pattern = "") {
		if (pattern.indexOf("*") > -1) {
			return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
		} else {
			return str == pattern.trim();
		}
	},

	readFile: function(filePath, isJSON) {
		try {
			if (fs.lstatSync(filePath).isFile() || fs.lstatSync(filePath).isSymbolicLink()) {
				let fileContent = fs.readFileSync(filePath, 'utf8');
				return isJSON ? JSON.parse(fileContent) : fileContent;
			}
		} catch (ex) {
			return null;
		}
	},

	hasFile: function(filePath, allowSymLinks) {		
		const stat = statSyncSafe(filePath);				
		return stat && stat.isFile() || (allowSymLinks && stat.isSymbolicLink());	
	},

	hasDir: function(dirPath, allowSymLinks) {		
		const stat = statSyncSafe(dirPath);	
		return stat && stat.isDirectory() || (allowSymLinks && stat.isSymbolicLink());	
	},

	hasSymlink: function(symlinkPath) {		
		const stat = statSyncSafe(symlinkPath);	
		return stat && stat.isSymbolicLink();
	}

};

function statSyncSafe(filePath) {
	try {
		return fs.lstatSync(filePath);				
	} catch(ex) {
		return null;
	}		
}