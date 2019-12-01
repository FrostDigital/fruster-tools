#!/usr/bin/env node

const program = require("commander");
const { getConfig } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg, getOrSelectNamespace } = require("../lib/utils/cli-utils");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <serviceName>", "name of app")
	.description(
		`
Get config for an app.

Example:

# Get config for app named api-gateway
$ fruster config get -a api-gateway -n paceup
`
	)
	.parse(process.argv);

const app = program.app;
let namespace = program.namespace;

validateRequiredArg(app, program, "Missing app name");

async function run() {
	try {
		if (!namespace) {
			namespace = await getOrSelectNamespace(app);
		}

		const config = await getConfig(namespace, app);

		if (!config) {
			log.warn(`Could not find config for '${app}', does the app exist?`);
			return process.exit(1);
		}

		log.success(`Got config for app ${app}`);

		for (const key in config) {
			log.info(`${key} = ${config[key]}`);
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
