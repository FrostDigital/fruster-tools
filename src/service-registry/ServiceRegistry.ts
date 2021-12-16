import * as log from "../log";
import { ServiceRegistryModel } from "../models/ServiceRegistryModel";

const utils = require("../utils");
// @ts-ignore
const template = require("es6-template-strings");

class ServiceRegistry {
	name: string;

	workDir?: string;

	services: ServiceRegistryModel["services"] = [];

	/**
	 *
	 * @param {any} model
	 * @param {any=} options
	 */
	constructor(model: ServiceRegistryModel, options: any = {}) {
		this.name = (options.name || model.name).replace(/\s/g, "-").toLowerCase();
		this.workDir = options.workDir;

		this.services = model.services
			.filter((service) => !(options.exclude || "").split(",").includes(service.name))
			.map((service) => {
				service.env = this.interpolateEnv(
					{ ...model.env, ...service.env },
					model.args || {},
					options.passHostEnv
				);
				service.appName = service.name; // TODO: Why rename?
				service.livenessHealthCheck = service.livenessHealthCheck;

				if (!service.imageTag && service.image) {
					const [_, imageTagFromImageName] = service.image.split(":");

					if (imageTagFromImageName) {
						service.imageTag = imageTagFromImageName;
						service.image = service.image.replace(":" + imageTagFromImageName, "");
					} else {
						service.imageTag = "latest";
					}
				}

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
	 * @param {any} env
	 * @param {any} args
	 * @param {boolean} passHostEnv
	 */
	interpolateEnv(env: any, args: any, passHostEnv: boolean) {
		for (let k in env) {
			let envValue = env[k];

			if (passHostEnv && process.env[k]) {
				env[k] = process.env[k];
			} else if (typeof envValue == "string" && envValue.includes("${")) {
				try {
					env[k] = template(envValue, { ...process.env, ...args });
				} catch (e) {
					log.error(`Failed to interpolate string - missing env var(s) for config: "${envValue}"`);
					process.exit(1);
				}
			}
		}
		return env;
	}

	toJSON() {
		return {
			name: this.name,
			services: this.services.map((service) => {
				return {
					name: service.name,
					appName: service.appName,
					repo: service.repo,
					env: service.env,
				};
			}),
		};
	}
}

export default ServiceRegistry;
