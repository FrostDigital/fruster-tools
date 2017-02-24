const serviceReg = require("../service-registry");
const ServiceDocumentation = require("./service-documentation");

module.exports = {
	generate: generate
};

function generate(serviceRegistryPath, destPath) {
	return serviceReg.create(serviceRegistryPath).then(serviceRegistry => {		
		serviceRegistry.cloneOrUpdateServices().then(() => {
			return new ServiceDocumentation(serviceRegistry, destPath).build(destPath);
		});
	});
}
