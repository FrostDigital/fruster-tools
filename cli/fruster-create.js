#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const { createDeployment, createService, createNamespace, copySecret, setConfig } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg, getUsername } = require("../lib/utils/cli-utils");

program
	.description(
		`
Creates kubernetes deployments for services in service registry.

Examples:

# Creates deployments for services that are defined in service registry
$ fruster create services.json

# Creates kube deployments for all services which name starts with 'ag-'
$ fruster create services.json -a ag-*
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <app>", "optional name of service to create deployment")
	// .option("-r, --recreate", "will recreate deployments")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const app = program.app;
const namespace = program.namespace;

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
		await createNamespace(appConfig.name, dryRun);

		// Copy existing imagePullSecret from default namespace services namespace
		await copySecret(appConfig.imagePullSecret || "regcred", "default", appConfig.name);

		// Upsert config (saved as secets)
		await setConfig(namespace, appConfig.name, appConfig.env);

		// Upsert deployment based on configuration from service registry
		await createDeployment(namespace, appConfig, username + " created app");

		log.success("Created deployment");

		if (appConfig.routable) {
			log.info("Service is routable, making sure that service exists...");
			const created = await createService(namespace, appConfig);
			log.success(`Service ${created ? "was created" : "already exists"}`);
		}
	}
}

run();
