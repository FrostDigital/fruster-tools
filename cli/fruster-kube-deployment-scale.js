#!/usr/bin/env node

const program = require("commander");
const { scaleDeployment, getPods } = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.description(
		`
Scale kubernetes deployment.

Example:

$ fruster kube deployment scale -r 2 -n api-gateway
`
	)
	.option("-r, --replicas <replicas>", "number of replicas")
	.option("-n, --service-name <serviceName>", "name of service")
	.parse(process.argv);

async function run() {
	const replicas = program.replicas;
	const serviceName = program.serviceName;

	if (!serviceName) {
		return program.outputHelp();
	}

	if (replicas === undefined) {
		const pods = await getPods(serviceName);
		log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	} else if (await scaleDeployment(serviceName, replicas)) {
		log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	}
}

run();
