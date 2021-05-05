#!/usr/bin/env node

const program = require("commander");
const { deleteDeployment, deleteSecret, deleteService } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg } = require("../lib/utils/cli-utils");
const inquirer = require("inquirer");

program
	.description(
		`
Removes an app/service and all resources related to it.

Examples:

$ fruster destroy -a api-gateway -n foo
`
	)
	.option("-a, --app <app name>", "Application name")
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.parse(process.argv);

const namespace = program.namespace;
const app = program.app;

validateRequiredArg(app, program, "Missing app name");
validateRequiredArg(namespace, program, "Namespace is required when destroying an app");

async function run() {
	try {
		const { confirm } = await inquirer.prompt([
			{
				type: "confirm",
				name: "confirm",
				default: false,
				message: "DANGER: Are you sure you want to remove " + app + "?"
			}
		]);

		if (confirm) {
			await deleteDeployment(namespace, app);
			log.info("Removed deployment");
			await deleteSecret(namespace, app + "-config");
			log.info("Removed config");
			if (await deleteService(namespace, app)) {
				log.info("Removed service");
			}
		}
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
