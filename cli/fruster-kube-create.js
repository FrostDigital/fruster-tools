#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const {
	createDeployment,
	createService,
	createNamespace,
	copySecret,
	createConfig
} = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.description(
		`
Create kubernetes deployment for services in service registry. Will skip deployments that already exists.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster kube create-deployment services.json -a
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-a, --app <app>", "name of app/service")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const app = program.app;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
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
			// Upsert namespace
			await createNamespace(appConfig.name);

			// Copy existing imagePullSecret from default namespace to new service namespace
			await copySecret(appConfig.imagePullSecret || "frost-docker-hub", "default", appConfig.name);

			// Upsert config (saved as secets)
			await createConfig(appConfig.name, appConfig.env);

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
