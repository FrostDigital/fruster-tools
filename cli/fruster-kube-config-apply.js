#!/usr/bin/env node

const program = require("commander");
const serviceRegistryFactory = require("../lib/service-registry");
const kubeClient = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.description(
		`
Sets config from service registry to a kubernetes deployment.

$ fruster update-config services.json -a api-gateway
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

		if (app) {
			const [appConfig] = serviceRegistry.getServices(app);

			if (!appConfig) {
				log.error("Could not find configuration for app/service " + app);
				return process.exit(1);
			}

			await kubeClient.createDeployment(appConfig);

			log.success("Created deployment");

			if (appConfig.routable) {
				log.info("Service is routable, making sure that service exists...");
				const created = await kubeClient.createService(appConfig);
				log.success(`Service ${created ? "was created" : "already exists"}`);
			}
		} else {
			// TODO: Create/init all in service registry
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
