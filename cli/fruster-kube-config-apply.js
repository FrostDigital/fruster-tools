#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const kubeClient = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.description(
		`
Applices config in service registry to kubernetes deployment(s).

$ fruster kube config apply services.json
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-n, --service-name <app>", "optional name service, accepts wildcard patterns")
	.option("-c, --create", "create services that does not exist")
	.option("-p, --prune", "remove existing config which does not exist in service registry")
	.option(
		"-r, --recreate",
		"recreates deployment, this will update everything, such as resource limits, routable and domains - not only env config"
	)
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const serviceName = program.serviceName;
const prune = program.prune;
const createIfNonExisting = program.create;
const recreateService = program.recreate;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
}

async function run() {
	try {
		const serviceRegistry = await serviceRegistryFactory.create(serviceRegPath);
		const services = serviceRegistry.getServices(serviceName || "*");
		const namespace = serviceRegistry.name;
		const { servicesToCreate, existingServices } = await getServicesToCreate(services);

		let createdServices = [];

		if (!dryRun) {
			for (const service of servicesToCreate) {
				await createService(namespace, service);
				createdServices.push(service.name);
				log.success(`[${service.name}] Was created`);
			}
		}

		for (const service of createIfNonExisting ? services : existingServices) {
			const existingConfig = (await kubeClient.getConfig(namespace, service.name)) || {};
			const newConfig = service.env || {};
			const changes = getConfigChanges(service.name, existingConfig, newConfig);

			let wasChanged = false;

			if (changes && !dryRun) {
				await kubeClient.setConfig(namespace, service.name, changes);
				log.success(`[${service.name}] Config was updated`);
				wasChanged = true;
			}

			if (recreateService && !createdServices.includes(service.name)) {
				const deployment = await kubeClient.getDeployment(namespace, service.name);

				if (deployment) {
					const existingContainerSpec = deployment.spec.template.spec.containers[0];
					const newImage = service.image + ":" + (service.imageTag || "latest");
					if (existingContainerSpec.image !== newImage) {
						log.info(`[${service.name}] Updating image ${existingContainerSpec.image} -> ${newImage}`);
					}

					// 	TODO: Diff healtchecks so it's obvious that it is being altered
					// if (!service.livenessHealthCheck || service.livenessHealthCheck === "fruster-health") {
					// 	if (!existingContainerSpec.livenessProbe || existingContainerSpec.livenessProbe === {}) {
					// 		log.info(`[${service.name}] Setting/updating liveness health check`);
					// 	}
					// }
				}

				const kubeService = await kubeClient.getService(namespace, service.name);

				let removeRoutable = false;

				if (service.routable && !kubeService) {
					log.info(`[${service.name}] Making service routable`);
				} else if (!service.routable && kubeService) {
					log.info(`[${service.name}] Removing 'routable', service will not receive TCP traffic anymore`);
					removeRoutable = true;
				}

				if (!dryRun) {
					await createService(namespace, service, removeRoutable);
					wasChanged = true;
					log.success(`[${service.name}] Deployment was recreated`);
				}
			}

			if (!dryRun && wasChanged) {
				// Restart pods in order for changes to propagate
				await kubeClient.restartPods(namespace, service.name, true);
			}
		}

		if (dryRun) {
			log.warn("This was just a dry-run, run same command with flag --yes to commit changes");
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

/**
 * Checks which services that already exists and which ones that needs
 * to be created.
 *
 * @param {Array<any>} services
 */
async function getServicesToCreate(services) {
	let existsCounter = 0;
	let servicesToCreate = [];
	let existingServices = [];

	log.info("Checking if services exists...");
	for (const service of services) {
		if (!(await kubeClient.getNamespace(service.name))) {
			if (createIfNonExisting) {
				log.info(`${service.name} does not exist and will be created`);
				servicesToCreate.push(service);
			} else {
				log.warn(`${service.name} does not exist, run with option -c to create service`);
			}
		} else {
			existingServices.push(service);
			existsCounter++;
		}
	}

	log.info(`${existsCounter} out of ${services.length} service(s) exists`);

	return {
		servicesToCreate,
		existingServices
	};
}

/**
 *
 * @param {string} name
 * @param {any} existingConfig
 * @param {any} newConfig
 */
function getConfigChanges(name, existingConfig, newConfig) {
	/**
	 * @type {any}
	 */
	let changeSet = {};
	let upToDate = true;

	for (const k in existingConfig) {
		if (newConfig[k] === undefined) {
			if (prune) {
				log.warn(`[${name}] Will remove ${k} (value was "${existingConfig[k]}")`);
				upToDate = false;
			} else {
				log.warn(
					`[${name}] App has config ${k} which is missing in service registry, use --prune to remove this, current value is "${existingConfig[k]}"`
				);
				changeSet[k] = existingConfig[k];
			}
		} else if (existingConfig[k] != newConfig[k]) {
			console.log(`[${name}] Updating ${k} ${existingConfig[k]} -> ${newConfig[k]}`);
			changeSet[k] = newConfig[k];
			upToDate = false;
		} else {
			log.debug(`[${name}] Config ${k} is up to date`);
			changeSet[k] = newConfig[k];
		}
	}

	for (const k in newConfig) {
		if (existingConfig[k] === undefined) {
			console.log(`[${name}] New config ${k}=${newConfig[k]}`);
			changeSet[k] = newConfig[k];
			upToDate = false;
		}
	}

	if (upToDate) {
		log.success(`[${name}] config is up to date`);
		changeSet = null;
	}

	return changeSet;
}

/**
 *
 * @param {string} namespace
 * @param {any} service
 * @param {boolean=} removeKubeService
 */
async function createService(namespace, service, removeKubeService = false) {
	// Upsert namespace
	await kubeClient.createNamespace(service.name);
	// Copy existing imagePullSecret from default namespace to new service namespace
	await kubeClient.copySecret(service.imagePullSecret || "regcred", "default", namespace);
	// Create deployment
	await kubeClient.createDeployment(namespace, service);
	// Create k8s service if routable
	if (service.routable) {
		await kubeClient.createService(namespace, service);
	} else if (removeKubeService) {
		await kubeClient.deleteService(namespace, service.name);
	}
}

run();
