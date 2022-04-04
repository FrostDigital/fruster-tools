#!/usr/bin/env node
import { program } from "commander";
import { getPods, scaleDeployment } from "../kube/kube-client";
import * as log from "../log";
import { validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`
Scale application.

Example:

$ fctl scale -r 2 -a api-gateway
`
	)
	.option("-r, --replicas <replicas>", "number of replicas")
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <app>", "name of service")
	.parse(process.argv);

const replicas = program.getOptionValue("replicas");
const serviceName = program.getOptionValue("app");
let namespace = program.getOptionValue("namespace");

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(namespace, program, "Missing namespace");
validateRequiredArg(replicas, program, "Missing number of replicas");

async function run() {
	if (replicas === undefined) {
		const pods = await getPods(namespace, serviceName);
		log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	} else if (await scaleDeployment(namespace, serviceName, replicas)) {
		log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	}
}

run();
