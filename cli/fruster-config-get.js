#!/usr/bin/env node

const program = require("commander");
const { getConfig } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg } = require("../lib/utils/cli-utils");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <serviceName>", "name of service")
	.description(
		`
Get config for a service (a.k.a app, a.k.a. deployment).

Example:

# Get config for service named api-gateway
$ fruster kube config get -a api-gateway -n paceup
`
	)
	.parse(process.argv);

const serviceName = program.app;
const namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing service name");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	try {
		const config = await getConfig(namespace, serviceName);

		if (!config) {
			log.warn(`Could not find config for '${serviceName}', does the service exist?`);
			return process.exit(1);
		}

		log.success(`Got config for service ${serviceName}`);

		for (const key in config) {
			log.info(`${key} = ${config[key]}`);
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
