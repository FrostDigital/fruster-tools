#!/usr/bin/env node

const program = require("commander");
const { scaleDeployment, getPods, getNamespaceForApp } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg } = require("../lib/utils/cli-utils");

program
	.description(
		`
Scale kubernetes deployment.

Example:

$ fruster scale -r 2 -n paceup -a pu-api-gateway
`
	)
	.option("-r, --replicas <replicas>", "number of replicas")
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const replicas = program.replicas;
const serviceName = program.app;
let namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(replicas, program, "Missing number of replicas");

async function run() {
	if (!namespace) {
		namespace = await getNamespaceForApp(serviceName);

		if (!namespace) {
			log.error(
				"Found more than one deployment named " + serviceName + " narrow down by using -n to enter namespace"
			);
			process.exit(1);
		}
	}

	if (replicas === undefined) {
		const pods = await getPods(namespace, serviceName);
		log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	} else if (await scaleDeployment(namespace, serviceName, replicas)) {
		log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	}
}

run();
