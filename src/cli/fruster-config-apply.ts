#!/usr/bin/env node

import { program } from "commander";
import { ServiceRegistryService } from "../models/ServiceRegistryModel";
import { create } from "../service-registry/service-registry-factory";
import ServiceRegistry from "../service-registry/ServiceRegistry";
import * as kubeClient from "../kube/kube-client";
import * as log from "../log";
const { validateRequiredArg, getUsername } = require("../utils/cli-utils");
const { patchDeploymentWithConfigHash } = require("../utils/config-utils");
const moment = require("moment");
const { FRUSTER_LIVENESS_ANNOTATION } = require("../kube/kube-constants");

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
const dryRun = !program.getOptionValue("yes");
const serviceName = program.getOptionValue("app");
const namespaceArg = program.getOptionValue("namespace");
const prune = program.getOptionValue("prune");
const createIfNonExisting = program.getOptionValue("create");
const recreateService = program.getOptionValue("recreate");

validateRequiredArg(serviceRegPath, program, "Missing service registry path");

async function run() {
	try {
		const serviceRegistry = await create(serviceRegPath);
		const apps = serviceRegistry.getServices(serviceName || "*");
		const namespace = namespaceArg || serviceRegistry.name;
		const { appsToCreate, existingApps } = await getAppsToCreate(namespace, apps);
		const username = await getUsername();

		let createdServices = [];

		if (!dryRun) {
			for (const app of appsToCreate) {
				await createApp(namespace, app, false, `${username} created app from service reg`);
				createdServices.push(app.name);
				log.success(`[${app.name}] Was created`);
			}
		}

		for (const app of createIfNonExisting ? apps : existingApps) {
			const existingConfig = (await kubeClient.getConfig(namespace, app.name)) || {};
			const newConfig = app.env || {};
			const changes = mergeConfig(app.name, existingConfig, newConfig);

			let wasChanged = false;

			if (changes && !dryRun) {
				await kubeClient.setConfig(namespace, app.name, changes);
				log.success(`[${app.name}] Config was updated`);
				wasChanged = true;
			}

			if (recreateService && !createdServices.includes(app.name)) {
				log.info(`[${app.name}] Will recreate app...`);
				const deployment = await kubeClient.getDeployment(namespace, app.name);

				if (deployment) {
					const existingContainerSpec = deployment.spec.template.spec.containers[0];
					const newImage = app.image + ":" + app.imageTag;
					if (existingContainerSpec.image !== newImage) {
						log.info(`[${app.name}] Updating image ${existingContainerSpec.image} -> ${newImage}`);
					}

					const existingLivenessHealthCheck =
						deployment.metadata.annotations[FRUSTER_LIVENESS_ANNOTATION] || "none";

					if (app.livenessHealthCheck !== existingLivenessHealthCheck) {
						log.info(
							`[${app.name}] Liveness health check ${existingLivenessHealthCheck} -> ${app.livenessHealthCheck}`
						);
					}
				}

				const kubeService = await kubeClient.getService(namespace, app.name);

				let removeRoutable = false;

				if (app.routable && !kubeService) {
					log.info(`[${app.name}] Updating routable 'false' -> 'true'`);
				} else if (!app.routable && kubeService) {
					log.info(`[${app.name}] Updating routable 'true' -> 'false'`);
					removeRoutable = true;
				}

				if (app.routable && !app.env.PORT) {
					log.error("App is routable but missing PORT in env");
					process.exit(1);
				}

				if (!dryRun) {
					await createApp(
						namespace,
						app,
						removeRoutable,
						`${username} recreated app from service registry at ${moment().format("YYYY-MM-DD HH:mm")}`
					);
					// wasChanged = true;
					log.success(`[${app.name}] Deployment was recreated`);
				}
			}

			if (!dryRun && wasChanged) {
				// Patch deployment to trigger rolling update with new config
				await patchDeploymentWithConfigHash(
					namespace,
					app.name,
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
 * @param {string} namespace
 * @param {Array<any>} services
 */
async function getAppsToCreate(namespace: string, services: ServiceRegistry["services"]) {
	let existsCounter = 0;
	let appsToCreate = [];
	let existingApps = [];

	log.info("Checking if services exists...");
	for (const service of services) {
		if (!(await kubeClient.getDeployment(namespace, service.name))) {
			if (createIfNonExisting) {
				log.info(`${service.name} does not exist and will be created`);
				appsToCreate.push(service);
			} else {
				log.warn(`${service.name} does not exist, run with option -c to create service`);
			}
		} else {
			existingApps.push(service);
			existsCounter++;
		}
	}

	log.info(`${existsCounter} out of ${services.length} service(s) exists`);

	return {
		appsToCreate,
		existingApps,
	};
}

/**
 *
 * @param {string} name
 * @param {any} existingConfig
 * @param {any} newConfig
 */
function mergeConfig(name: string, existingConfig: any, newConfig: any) {
	/**
	 * @type {any}
	 */
	let mergedConfig: any = {};
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
async function createApp(
	namespace: string,
	service: ServiceRegistryService,
	removeKubeService = false,
	changeCause = ""
) {
	// Upsert namespace
	await kubeClient.createNamespace(service.name);

	// Copy existing imagePullSecret from default namespace to new service namespace
	if (service.imagePullSecret) {
		await kubeClient.copySecret(service.imagePullSecret, "default", namespace);
	}

	// Upsert deployment
	await kubeClient.createAppDeployment(namespace, service, changeCause);
	// Create k8s service if routable
	if (service.routable) {
		await kubeClient.createService(namespace, service);
	} else if (removeKubeService) {
		await kubeClient.deleteService(namespace, service.name);
	}
}

run();
