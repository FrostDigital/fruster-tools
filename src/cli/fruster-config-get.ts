#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import * as log from "../log";
import { getOrSelectNamespaceForApp, validateRequiredArg } from "../utils/cli-utils";
import { getDeployment } from "../kube/kube-client";
import { getDeploymentAppConfig } from "../utils/kube-utils";

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <app>", "name of app")
	// .option("-g, --global", "if to get global config only")
	.description(
		`Get config for an app.

Example:

# Get config for app named api-gateway
$ fctl config get -a api-gateway -n my-namespace
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

		const { config, globalConfig } = await getDeploymentAppConfig(deployment, true);

		log.success(`Got config for app ${app}:\n`);

		for (const row of globalConfig || []) {
			console.log(chalk.cyan(`${row.name}="${row.value}" ${chalk.bold("(GC)")}`));
		}

		for (const row of config) {
			log.info(`${row.name}="${row.value}"`);
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
