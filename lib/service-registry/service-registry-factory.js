const fileSvcRegClient = require("./file-service-registry-client");
const gitSvcRegClient = require("./git-service-registry-client");
const ServiceRegistry = require("./service-registry");
const deepMerge = require("deepmerge")
const _ = require("lodash");

module.exports = {
  create: create
};

function create(path, options = {}) {	
	let serviceRegistryModelPromise;

	if(fileSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = fileSvcRegClient.get(path);
	} else if(gitSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = gitSvcRegClient.get(path, options.environment);
	} else {
		throw new Error("Invalid path: " + path);
	}

	return serviceRegistryModelPromise
		.then(merge)
		.then(serviceRegistryModel => new ServiceRegistry(serviceRegistryModel, options));	
}

function merge(serviceRegistryChain) {		
	if(!serviceRegistryChain.length) {
		throw "No service registry file found";
	}

	let leaf = serviceRegistryChain[0];
	
	if(serviceRegistryChain.length === 1) {
		return leaf;
	}

	leaf = deepMerge.all(serviceRegistryChain);
	
	serviceRegistryChain.reverse();

	leaf.env = mergeEnv(serviceRegistryChain);
	leaf.services = mergeServices(serviceRegistryChain);
	
	return leaf;
}

function mergeEnv(serviceRegistryChain) {
	return deepMerge.all(serviceRegistryChain.map(o => o.env || {}))
}

function mergeServices(serviceRegistryChain) {
	let tempServicesMap = {};

	_.flatMap(serviceRegistryChain, o => o.services || [])
		.forEach(service => {
			tempServicesMap[service.name] = deepMerge(tempServicesMap[service.name] || {}, service);
		});
	
	return Object.keys(tempServicesMap).map(k => tempServicesMap[k]);
}
