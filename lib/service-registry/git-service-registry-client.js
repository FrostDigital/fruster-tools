const utils = require("../utils");
const git = require("../git");
const path = require("path");
const conf = require("../../conf");

module.exports =  {
	get: get,
	isValid: isValid
};

function get(gitPath, environment) {		
	const name = getName(gitPath);
	const svcRegPath = path.join(conf.frusterHome, "service-registries", name);
	const jsonFile = environment ? `services-${environment}.json` : "services.json";

	return cloneOrUpdate(gitPath, svcRegPath).then(() => {
		let serviceRegistry = utils.readFile(path.join(svcRegPath, jsonFile), true);

		if(serviceRegistry.extends) {
			return getParents([serviceRegistry], getParentFilePath(svcRegPath, serviceRegistry.extends));
		} else {
			return [serviceRegistry];
		}		
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

/**
 * Recursively get parent service registries and return 
 * an inheritance chain as the result
 * @param  {array} resultArr               
 * @param  {string} serviceRegistryFilePath 
 * @return {array} 
 */
function getParents(resultArr, serviceRegistryFilePath) {	
	const parentServiceRegistry = utils.readFile(serviceRegistryFilePath, true);

	resultArr.push(parentServiceRegistry);

	if(parentServiceRegistry.extends) {		
		const parentFilePath = getParentFilePath(serviceRegistryFilePath, parentServiceRegistry.extends)
		getParents(resultArr, parentFilePath);
	}

	return resultArr;
}

function getParentFilePath(serviceRegistryPath, parentRelativePath) {
	const basePath = path.join(serviceRegistryPath, "..");		
	return path.join(basePath, parentRelativePath);	
}
