#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const kubeClient = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg, getUsername } = require("../lib/utils/cli-utils");
const { pathDeploymentWithConfigHash } = require("../lib/utils/config-utils");
const moment = require("moment");

program
	.description(
		`
Applies config in service registry to kubernetes deployment(s).

This is a swiss army knife, where one can create, recreate and configure services in
service registry.

Examples:

# Sets config for all apps defined in service registry
$ fruster config apply services.json

# Creates deployments and sets config for all apps defined in service registry
$ fruster config apply services.json -c

# Recreates deployment and sets config for api-gateway
$ fruster config apply services.json -r -a api-gateway
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-a, --app <app>", "optional name of app")
	.option(
		"-n, --namespace <namespace>",
		"optional kubernetes namespace, will if not set take namespace from sevice registry"
	)
	.option("-c, --create", "create services that does not exist")
	.option("-p, --prune", "remove existing config which does not exist in service registry")
	.option(
		"-r, --recreate",
		"recreates deployment, this will update everything, such as resource limits, routable and domains - not only env config"
	)
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const serviceName = program.app;
const namespaceArg = program.namespace;
const prune = program.prune;
const createIfNonExisting = program.create;
const recreateService = program.recreate;

validateRequiredArg(serviceRegPath, program, "Missing service registry path");

async function run() {
	try {
		const serviceRegistry = await serviceRegistryFactory.create(serviceRegPath);
		const services = serviceRegistry.getServices(serviceName || "*");
		const namespace = namespaceArg || serviceRegistry.name;
		const { servicesToCreate, existingServices } = await getServicesToCreate(services);
		const username = await getUsername();

		let createdServices = [];

		if (!dryRun) {
			for (const service of servicesToCreate) {
				await createService(namespace, service, false, `${username} created app from service reg`);
				createdServices.push(service.name);
				log.success(`[${service.name}] Was created`);
			}
		}

		for (const service of createIfNonExisting ? services : existingServices) {
			const existingConfig = (await kubeClient.getConfig(namespace, service.name)) || {};
			const newConfig = service.env || {};
			const changes = mergeConfig(service.name, existingConfig, newConfig);

			let wasChanged = false;

			if (changes && !dryRun) {
				await kubeClient.setConfig(namespace, service.name, changes);
				log.success(`[${service.name}] Config was updated`);
				wasChanged = true;
			}

			if (recreateService && !createdServices.includes(service.name)) {
				log.info(`[${service.name}] Will recreate app...`);
				const deployment = await kubeClient.getDeployment(namespace, service.name);

				if (deployment) {
					const existingContainerSpec = deployment.spec.template.spec.containers[0];
					const newImage = service.image + ":" + service.imageTag;
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
					await createService(
						namespace,
						service,
						removeRoutable,
						`${username} recreated app from service registry at ${moment().format("YYYY-MM-DD HH:mm")}`
					);
					// wasChanged = true;
					log.success(`[${service.name}] Deployment was recreated`);
				}
			}

			if (!dryRun && wasChanged) {
				// Patch deployment to trigger rolling update with new config
				await pathDeploymentWithConfigHash(
					namespace,
					service.name,
					changes,
					"Config updated when service registry was applied"
				);
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
function mergeConfig(name, existingConfig, newConfig) {
	/**
	 * @type {any}
	 */
	let mergedConfig = {};
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
				mergedConfig[k] = existingConfig[k];
			}
		} else if (existingConfig[k] != newConfig[k]) {
			console.log(`[${name}] Updating ${k} ${existingConfig[k]} -> ${newConfig[k]}`);
			mergedConfig[k] = newConfig[k];
			upToDate = false;
		} else {
			log.debug(`[${name}] Config ${k} is up to date`);
			mergedConfig[k] = newConfig[k];
		}
	}

	for (const k in newConfig) {
		if (existingConfig[k] === undefined) {
			console.log(`[${name}] New config ${k}=${newConfig[k]}`);
			mergedConfig[k] = newConfig[k];
			upToDate = false;
		}
	}

	if (upToDate) {
		log.success(`[${name}] env config is up to date`);
		mergedConfig = null;
	}

	return mergedConfig;
}

/**
 *
 * @param {string} namespace
 * @param {any} service
 * @param {boolean=} removeKubeService
 * @param {string=} changeCause
 */
async function createService(namespace, service, removeKubeService = false, changeCause = "") {
	// Upsert namespace
	await kubeClient.createNamespace(service.name);
	// Copy existing imagePullSecret from default namespace to new service namespace
	await kubeClient.copySecret(service.imagePullSecret || "regcred", "default", namespace);
	// Upsert deployment
	await kubeClient.createDeployment(namespace, service, changeCause);
	// Create k8s service if routable
	if (service.routable) {
		await kubeClient.createService(namespace, service);
	} else if (removeKubeService) {
		await kubeClient.deleteService(namespace, service.name);
	}
}

run();
