const fs = require("fs");
const path = require("path");
const utils = require("../utils");

module.exports = {
	get: get,
	isValid: isValid
};

function get(serviceRegistryPath) {
	let serviceRegistry = utils.readFile(serviceRegistryPath, true);

	if (!serviceRegistry) {
		throw new Error("Invalid or missing service registry (is JSON valid?)");
	}

	if (serviceRegistry.extends) {
		const parentFilePath = getParentFilePath(serviceRegistryPath, serviceRegistry.extends);
		return Promise.resolve(getParents([serviceRegistry], parentFilePath));
	} else {
		return Promise.resolve([serviceRegistry]);
	}
}

function isValid(serviceRegPath) {
	try {
		const stat = fs.lstatSync(serviceRegPath);
		return stat.isFile() || stat.isSymbolicLink();
	} catch (ex) {
		return false;
	}
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

	if (!parentServiceRegistry) {
		throw "Failed reading service registry file " + serviceRegistryFilePath;
	}

	resultArr.push(parentServiceRegistry);

	if (parentServiceRegistry.extends) {
		const parentFilePath = getParentFilePath(serviceRegistryFilePath, parentServiceRegistry.extends);
		getParents(resultArr, parentFilePath);
	}

	return resultArr;
}

function getParentFilePath(serviceRegistryPath, parentRelativePath) {
	const basePath = path.join(serviceRegistryPath, "..");
	return path.join(basePath, parentRelativePath);
}
