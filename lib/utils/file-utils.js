const fs = require("fs-extra");
const path = require("path");
const uuid = require("uuid");

module.exports = {	

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
		return (stat !== null && stat.isFile()) || (stat !== null && allowSymLinks && stat.isSymbolicLink());
	},

	hasDir: function(dirPath, allowSymLinks) {
		const stat = statSyncSafe(dirPath);
		return (stat !== null && stat.isDirectory()) || (stat !== null && allowSymLinks && stat.isSymbolicLink());
	},

	hasSymlink: function(symlinkPath) {
		const stat = statSyncSafe(symlinkPath);
		return stat !== null && stat.isSymbolicLink();
	},

	getGithubRepoUrl: function(repoUrl) {		
		// Add full github url if just `org/repo` is passed in
		if (!repoUrl.includes("git@github.com") && !repoUrl.includes("http://") && !repoUrl.includes("https://")) {
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

		return {
			repo: split[split.length-1],
			org: split[split.length-2],
			branch: branch
		};
	},	

	getFilename(filePath) {
		let arr = filePath.split("/");
		return arr.pop();
	},

	getDirPath(filePath) {
  		let absolutePath = path.resolve(filePath);
  		let arr = absolutePath.split("/");
  		arr.pop();
  		return arr.join("/");
	},

	writeTempJsonFile(filename, json) {		
		const tempDirPath = path.join(path.sep, "tmp", "fruster_" + uuid.v1());  		
		const fullPath = path.join(tempDirPath, "services.json");  		

		fs.ensureDirSync(tempDirPath);
  		fs.writeJsonSync(fullPath, json);

		return fullPath;
	}
};

function statSyncSafe(filePath) {
	try {
		return fs.lstatSync(filePath);
	} catch (ex) {
		return null;
	}
}