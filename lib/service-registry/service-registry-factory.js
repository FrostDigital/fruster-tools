const fileSvcRegClient = require("./file-service-registry-client");
const gitSvcRegClient = require("./git-service-registry-client");
const ServiceRegistry = require("./service-registry");

module.exports = {
  create: create
};

function create(path, options /*path, name, branch, passHostEnv={}*/) {	
	let serviceRegistryModelPromise;

	if(fileSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = fileSvcRegClient.get(path);
	} else if(gitSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = gitSvcRegClient.get(path, options.environment);
	} else {
		throw new Error("Invalid path: " + path);
	}

	return serviceRegistryModelPromise.then(serviceRegistryModel => new ServiceRegistry(serviceRegistryModel, options));	
}


