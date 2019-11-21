#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const { createDeployment, createService, createNamespace, copySecret, setConfig } = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.description(
		`
Create kubernetes deployment for services in service registry. Will skip deployments that already exists.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster kube deployment create services.json -a ag-*
`
	)
	//	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-n, --service-name <app>", "optional name of service to create deployment")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const app = program.app;

if (!serviceRegPath) {
	log.error("Missing service registry path");
	program.outputHelp();
	return process.exit(1);
}

async function run() {
	try {
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

			// Copy existing imagePullSecret from default namespace to new service namespace
			await copySecret(appConfig.imagePullSecret || "frost-docker-hub", "default", appConfig.name);

			// Upsert config (saved as secets)
			await setConfig(appConfig.name, appConfig.env);

			// Upsert deployment based on configuration from service registry
			await createDeployment(appConfig);

			log.success("Created deployment");

			if (appConfig.routable) {
				log.info("Service is routable, making sure that service exists...");
				const created = await createService(appConfig);
				log.success(`Service ${created ? "was created" : "already exists"}`);
			}
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
