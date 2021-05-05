const fileSvcRegClient = require("./file-service-registry-client");
const ServiceRegistry = require("./service-registry");
const deepMerge = require("deepmerge");
const _ = require("lodash");
const Ajv = require("ajv");
const serviceRegistrySchema = require("../../schemas/service-registry-schema");
const log = require("../log");

const ajv = new Ajv();

module.exports = {
	create: create
};

function create(path, options = {}) {
	let serviceRegistryModelPromise;

	if (fileSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = fileSvcRegClient.get(path);
	} else {
		throw new Error("Invalid path: " + path);
	}

	return serviceRegistryModelPromise
		.then(merge)
		.then(validate)
		.then(serviceRegistryModel => new ServiceRegistry(serviceRegistryModel, options));
}

function merge(serviceRegistryChain) {
	if (!serviceRegistryChain.length) {
		throw "No service registry file found";
	}

	let leaf = serviceRegistryChain[0];

	if (serviceRegistryChain.length === 1) {
		return leaf;
	}

	leaf = deepMerge.all(serviceRegistryChain);

	serviceRegistryChain.reverse();

	leaf.env = mergeEnv(serviceRegistryChain);
	leaf.services = mergeServices(serviceRegistryChain);

	return leaf;
}

function validate(serviceRegistryModel) {
	const valid = ajv.validate(serviceRegistrySchema, serviceRegistryModel);

	if (!valid) {
		let humanReadableErrors = [];

		for (const error of ajv.errors) {
			if (error.keyword === "additionalProperties") {
				humanReadableErrors.push(`Invalid property '${error.params.additionalProperty}'`);
			}
		}

		log.error("Invalid service registry - " + ajv.errorsText());

		if (humanReadableErrors.length) {
			log.error(humanReadableErrors.join("\n"));
		}

		throw new Error("Service registry json did not validate");
	}

	return serviceRegistryModel;
}

function mergeEnv(serviceRegistryChain) {
	return deepMerge.all(serviceRegistryChain.map(o => o.env || {}));
}

/**
 * Merge services in service registries.
 *
 * @param {Array<Object>} serviceRegistries
 */
function mergeServices(serviceRegistries) {
	let tempServicesMap = {};

	_.flatMap(serviceRegistries, o => o.services || []).forEach(service => {
		tempServicesMap[service.name] = deepMerge(tempServicesMap[service.name] || {}, service);
	});

	return Object.keys(tempServicesMap).map(k => tempServicesMap[k]);
}
