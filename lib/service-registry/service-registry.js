const utils = require("../utils");
const conf = require("../../conf");
const path = require("path");
const log = require("../log");
const template = require("es6-template-strings");

class ServiceRegistry {
	constructor(model, options = {}) {
		this.branch = options.branch || model.branch || "develop";
		this.name = options.name || model.name;
		this.workDir = options.workDir;

		this.services = model.services
			.filter(service => !(options.exclude || "").split(",").includes(service.name))
			.map(service => {
				service.isDir = this.isDir(service);
				service.workDir = service.isDir ? service.repo : this.getWorkdir(service);
				service.env = this.interpolateEnv(
					{ ...model.env, ...service.env },
					model.args || {},
					options.passHostEnv
				);
				service.branch = service.branch || this.branch;
				service.appName = service.appName || service.name;

				// Remove all null values
				for (let k in service.env) {
					if (service.env[k] === null) {
						delete service.env[k];
					}
				}

				return service;
			});

		this.buildProcesses = [];
		this.startedProcesses = [];
	}

	// Get services, can be filtered
	getServices(pattern = "*") {
		return this.services.filter(service => utils.matchPattern(service.name, pattern));
	}

	getWorkdir(service) {
		if (this.workDir) {
			return path.join(this.workDir, service.name);
		} else {
			return path.join(conf.frusterHome, this.name, service.name);
		}
	}

	isDir(service) {
		if (service.repo && service.repo.indexOf("/") === 0) {
			if (!utils.hasDir(service.repo, true)) {
				throw "No such dir: " + service.repo;
			}
			return true;
		}
		return false;
	}

	interpolateEnv(env, args, passHostEnv) {
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
			branch: this.branch,
			services: this.services.map(service => {
				return {
					name: service.name,
					appName: service.appName,
					repo: service.repo,
					build: service.build,
					start: service.start,
					test: service.test,
					branch: service.branch,
					env: service.env
				};
			})
		};
	}
}

module.exports = ServiceRegistry;
