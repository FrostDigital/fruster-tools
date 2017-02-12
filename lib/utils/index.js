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
		return (stat != null && stat.isFile()) || (stat != null && allowSymLinks && stat.isSymbolicLink());
	},

	hasDir: function(dirPath, allowSymLinks) {
		const stat = statSyncSafe(dirPath);
		return (stat != null && stat.isDirectory()) || (stat != null && allowSymLinks && stat.isSymbolicLink());
	},

	hasSymlink: function(symlinkPath) {
		const stat = statSyncSafe(symlinkPath);
		return stat != null && stat.isSymbolicLink();
	},

	getGithubRepoUrl: function(repoUrl) {
		// Add full github url if just `org/repo` is passed in
		if (!repoUrl.includes("git@github.com") && !repoUrl.includes("http://")) {
			return "git@github.com:" + repoUrl + ".git";
		} else {
			return repoUrl;
		}
	},

	parseGitUrl: function(path) {		
		// Get branch if specified with hash
		let branch = null; 
		let branchSplit = path.split("#");
		
		branch = branchSplit.length == 2 ? branchSplit[1] : null;

		// Get organisation and repo name
		path = branchSplit[0].replace(".git", "").replace(":", "/");

		let split = path.split("/");

		return res = {
			repo: split[split.length-1],
			org: split[split.length-2],
			branch: branch
		};
	},

	capitalize: ([first,...rest]) => {
		return first.toUpperCase() + rest.join("").toLowerCase();
	}

};

function statSyncSafe(filePath) {
	try {
		return fs.lstatSync(filePath);
	} catch (ex) {
		return null;
	}
}