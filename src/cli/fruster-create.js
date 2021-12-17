#!/usr/bin/env node

const { program } = require("commander");
const serviceRegistryFactory = require("../service-registry");
const { createDeployment, createService, createNamespace, copySecret, setConfig } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getUsername } = require("../utils/cli-utils");

program
	.description(
		`
Creates kubernetes deployments for services that are defined service registry.

Namespace will be created if it does not already exists.

Examples:

# Creates deployments for services that are defined in service registry
$ fruster create services.json

# Creates kube deployments for all services which name starts with 'ag-'
$ fruster create services.json -a ag-*
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <app>", "optional name of service to create deployment")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.opts().yes;
const app = program.opts().app;
const namespace = program.opts().namespace;

validateRequiredArg(serviceRegPath, program, "Missing service registry path");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	const username = await getUsername();

	const serviceRegistry = await serviceRegistryFactory.create(serviceRegPath);

	const apps = serviceRegistry.getServices(app || "*");

	if (!apps.length) {
		log.error("Could not find configuration for services " + app);
		return process.exit(1);
	}

	for (const appConfig of apps) {
		if (!appConfig.image) {
			log.warn("No 'image' set for service " + appConfig.name);
			continue;
		}
		// Upsert namespace
		await createNamespace(namespace || appConfig.name, dryRun);

		if (appConfig.imagePullSecret) {
			if (!dryRun) {
				// Copy existing imagePullSecret from default namespace services namespace
				if (!(await copySecret(appConfig.imagePullSecret, "default", appConfig.name))) {
					process.exit(1);
				}
			} else {
				log.info(`[Dry run] Skipping copy of imagePullSecret ${appConfig.imagePullSecret || "regcred"}`);
			}
		}

		if (!dryRun) {
			// Upsert config (saved as secets)
			await setConfig(namespace, appConfig.name, appConfig.env);
		} else {
			log.info(`[Dry run] Skipping set config ${appConfig.name} ${JSON.stringify(appConfig.env)}`);
		}

		if (!dryRun) {
			// Upsert deployment based on configuration from service registry
			await createDeployment(namespace, appConfig, username + " created app", appConfig.imagePullSecret);
		} else {
			log.info(`[Dry run] Skipping create deployment`);
		}

		log.success("Created deployment");

		if (appConfig.routable) {
			log.info("Service is routable, making sure that service exists...");

			if (!dryRun) {
				const created = await createService(namespace, appConfig);
				log.success(`Service ${created ? "was created" : "already exists"}`);
			} else {
				log.info(`[Dry run] Skipping make routable`);
			}
		}
	}
}

run();
