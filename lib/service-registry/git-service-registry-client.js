const fs = require("fs");
const utils = require("../utils");
const git = require("../git");
const path = require("path");
const conf = require("../../conf");

module.exports =  {
	get: get,
	isValid: isValid
};

function get(gitPath) {		
	const name = getName(gitPath);
	const svcRegPath = path.join(conf.frusterHome, "service-registries", name);

	return cloneOrUpdate(gitPath, svcRegPath).then(repo => {
		return utils.readFile(path.join(svcRegPath, "services.json"), true);
	});
}

function cloneOrUpdate(gitPath, svcRegPath) {
	if(utils.hasDir(svcRegPath)) {
		return git.init(svcRegPath).then(git.pull);
	} else {
		return git.clone(gitPath, svcRegPath);
	}
}

function isValid(gitPath) {	
	return gitPath.split("/").length == 2 || path.indexOf("git://") == 0 || path.indexOf("https://github") == 0;	
}

function getName(path) {
	const orgAndRepo = utils.parseGitUrl(path);
	return `${orgAndRepo.org.toLowerCase()}-${orgAndRepo.repo.toLowerCase()}`;
}
