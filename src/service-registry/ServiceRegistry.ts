import * as log from "../log";
import { ServiceRegistryModel } from "../models/ServiceRegistryModel";
import { getDockerRegistry } from "../utils";

const utils = require("../utils");
// @ts-ignore
const template = require("es6-template-strings");

class ServiceRegistry {
	name: string;

	workDir?: string;

	services: ServiceRegistryModel["services"] = [];

	apiVersion?: ServiceRegistryModel["apiVersion"];

	globalEnv?: { [x: string]: string } = {};

	/**
	 *
	 * @param {any} model
	 * @param {any=} options
	 */
	constructor(model: ServiceRegistryModel, options: any = {}) {
		this.name = (options.name || model.name).replace(/\s/g, "-").toLowerCase();
		this.workDir = options.workDir;
		this.apiVersion = model.apiVersion || "2"; // default to latest version

		if (this.apiVersion === "2") {
			this.globalEnv = model.env;
		}

		this.services = model.services
			.filter((service) => !(options.exclude || "").split(",").includes(service.name))
			.map((service) => {
				// Version 2 saves global env in global config
				const serviceEnv = this.apiVersion === "1" ? { ...model.env, ...service.env } : { ...service.env };

				service.env = this.interpolate(serviceEnv, model.args || {}, options.passHostEnv);
				service.livenessHealthCheck = service.livenessHealthCheck;

				if (service.image) {
					const { image } = this.interpolate({ image: service.image }, model.args, options.passHostEnv);
					service.image = image;
				}

				if (!service.imageTag && service.image) {
					const [_, imageTagFromImageName] = service.image.split(":");

					if (imageTagFromImageName) {
						service.imageTag = imageTagFromImageName;
						service.image = service.image.replace(":" + imageTagFromImageName, "");
					} else {
						service.imageTag = "latest";
					}
				}

				service.registry = getDockerRegistry(service.image || "");

				// Remove all null values
				for (let k in service.env) {
					if (service.env[k] === null) {
						delete service.env[k];
					}
				}

				return service;
			});
	}

	// Get services, can be filtered
	getServices(pattern = "*") {
		return this.services.filter((service) => utils.matchPattern(service.name, pattern));
	}

	/**
	 *
	 * @param {any} objectToInterpolate
	 * @param {any} args
	 * @param {boolean} passHostEnv
	 */
	interpolate(objectToInterpolate: any, args: any, passHostEnv: boolean) {
		for (let k in objectToInterpolate) {
			let envValue = objectToInterpolate[k];

			if (passHostEnv && process.env[k]) {
				objectToInterpolate[k] = process.env[k];
			} else if (typeof envValue == "string" && envValue.includes("${")) {
				try {
					objectToInterpolate[k] = template(envValue, { ...process.env, ...args });
				} catch (e) {
					log.error(`Failed to interpolate string - missing env var(s) for config: "${envValue}"`);
					process.exit(1);
				}
			}
		}
		return objectToInterpolate;
	}

	toJSON() {
		return {
			name: this.name,
			services: this.services.map((service) => {
				return {
					name: service.name,
					appName: service.name,
					repo: service.repo,
					env: service.env,
				};
			}),
		};
	}
}

export default ServiceRegistry;
