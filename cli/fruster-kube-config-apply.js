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
	.option("-n, --name <app>", "optional name service, accepts wildcard patterns")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = !program.yes;
const serviceName = program.name;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
}

async function run() {
	try {
		const serviceRegistry = await serviceRegistryFactory.create(serviceRegPath);

		if (serviceName) {
			const services = serviceRegistry.getServices(serviceName);

			for (const service of services) {
				await kubeClient.createDeployment(service);

				// if (appConfig.routable) {
				// 	log.info("Service is routable, making sure that service exists...");
				// 	const created = await kubeClient.createService(appConfig);
				// 	log.success(`Service ${created ? "was created" : "already exists"}`);
				// }
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
