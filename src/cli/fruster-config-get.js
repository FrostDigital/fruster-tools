#!/usr/bin/env node

const program = require("commander").program;
const { getDeployment } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespaceForApp } = require("../utils/cli-utils");
const { getDeploymentAppConfig } = require("../utils/kube-utils");

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

const app = program.opts().app;
let namespace = program.opts().namespace;

validateRequiredArg(app, program, "Missing app name");

async function run() {
	try {
		if (!namespace) {
			namespace = await getOrSelectNamespaceForApp(app);
		}

		const deployment = await getDeployment(namespace, app);

		if (!deployment) {
			log.warn(`Could not find deployment for '${app}'`);
			return process.exit(1);
		}

		const { config } = getDeploymentAppConfig(deployment);

		log.success(`Got config for app ${app}`);

		for (const row of config) {
			log.info(`${row.name}="${row.value}"`);
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
