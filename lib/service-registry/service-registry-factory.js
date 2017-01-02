const fileSvcRegClient = require("./file-service-registry-client");
const gitSvcRegClient = require("./git-service-registry-client");
const ServiceRegistry = require("./service-registry");

module.exports = {
  create: create
};

function create(path, name, branch) {
	let svcRegModel;

	if(fileSvcRegClient.isValid(path)) {
		svcRegModel = fileSvcRegClient.get(path);
	} else if(gitSvcRegClient.isValid(path)) {
		svcRegModel = gitSvcRegClient.get(path);
	} else {
		throw new Error("Invalid path: " + path);
	}

	return new ServiceRegistry(svcRegModel, name, branch);
}


