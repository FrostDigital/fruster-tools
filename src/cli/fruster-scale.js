#!/usr/bin/env node

const program = require("commander");
const { scaleDeployment, getPods } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespace } = require("../utils/cli-utils");

program
	.description(
		`
Scale application.

Example:

$ fruster scale -r 2 -a api-gateway
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
		namespace = await getOrSelectNamespace(serviceName);
	}

	if (replicas === undefined) {
		const pods = await getPods(namespace, serviceName);
		log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	} else if (await scaleDeployment(namespace, serviceName, replicas)) {
		log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	}
}

run();
