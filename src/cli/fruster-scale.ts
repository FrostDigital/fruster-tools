#!/usr/bin/env node
import { program } from "commander";
import { scaleDeployment, getPods } from "../kube/kube-client";
import * as log from "../log";
const { validateRequiredArg, getOrSelectNamespaceForApp } = require("../utils/cli-utils");

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

const replicas = program.getOptionValue("replicas");
const serviceName = program.getOptionValue("app");
let namespace = program.getOptionValue("namespace");

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(replicas, program, "Missing number of replicas");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespaceForApp(serviceName);
	}

	if (replicas === undefined) {
		const pods = await getPods(namespace, serviceName);
		log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	} else if (await scaleDeployment(namespace, serviceName, replicas)) {
		log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	}
}

run();
