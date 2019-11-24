#!/usr/bin/env node

const program = require("commander");
const { getConfig } = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.option("-n, --service-name <serviceName>", "name of service")
	.description(
		`
Get config for a service (a.k.a app, a.k.a. deployment).

Example:

# Get config for service named api-gateway
$ fruster kube config get -n api-gateway
`
	)
	.parse(process.argv);

async function run() {
	const serviceName = program.serviceName;
	try {
		const config = await getConfig(serviceName); // TODO: namespace!

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
