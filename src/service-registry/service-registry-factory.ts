import { ServiceRegistryModel as ServiceRegistryModel } from "../models/ServiceRegistryModel";
import * as log from "../log";
import _ from "lodash";
import * as fileSvcRegClient from "./file-service-registry-client";
import ServiceRegistry from "./ServiceRegistry";
import deepMerge from "deepmerge";
import Ajv from "ajv";

const serviceRegistrySchema = require("../../src/schemas/service-registry-schema");

const ajv = new Ajv();

export function create(path: string, options = {}): Promise<ServiceRegistry> {
	let serviceRegistryModelPromise;

	if (fileSvcRegClient.isValid(path)) {
		serviceRegistryModelPromise = fileSvcRegClient.get(path);
	} else {
		throw new Error("Invalid path: " + path);
	}

	return serviceRegistryModelPromise
		.then(merge)
		.then(validate)
		.then((serviceRegistryModel: ServiceRegistryModel) => new ServiceRegistry(serviceRegistryModel, options));
}

function merge(serviceRegistryChain: ServiceRegistryModel[]) {
	if (!serviceRegistryChain.length) {
		throw "No service registry file found";
	}

	let leaf = serviceRegistryChain[0];

	if (serviceRegistryChain.length === 1) {
		return leaf;
	}

	leaf = deepMerge.all<ServiceRegistryModel>(serviceRegistryChain);

	serviceRegistryChain.reverse();

	leaf.env = mergeEnv(serviceRegistryChain);
	leaf.services = mergeServices(serviceRegistryChain);

	return leaf;
}

function validate(serviceRegistryModel: ServiceRegistryModel) {
	const valid = ajv.validate(serviceRegistrySchema, serviceRegistryModel);

	if (!valid) {
		let humanReadableErrors = [];

		// @ts-ignore
		for (const error of ajv.errors) {
			if (error.keyword === "additionalProperties") {
				// @ts-ignore
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

function mergeEnv(serviceRegistryChain: ServiceRegistryModel[]) {
	return deepMerge.all<{ [x: string]: string }>(serviceRegistryChain.map((o) => o.env || {}));
}

/**
 * Merge services in service registries.
 *
 * @param {Array<Object>} serviceRegistries
 */
function mergeServices(serviceRegistries: ServiceRegistryModel[]) {
	let tempServicesMap: any = {};

	_.flatMap(serviceRegistries, (o) => o.services || []).forEach((service) => {
		tempServicesMap[service.name] = deepMerge(tempServicesMap[service.name] || {}, service);
	});

	return Object.keys(tempServicesMap).map((k) => tempServicesMap[k]);
}
