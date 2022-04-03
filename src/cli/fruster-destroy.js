#!/usr/bin/env node

const { program } = require("commander");
const { deleteDeployment, deleteSecret, deleteService, deleteReplicaSet } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, confirmPrompt } = require("../utils/cli-utils");

program
	.description(
		`
Removes an app/service and all resources related to it.

Examples:

$ fctl destroy -a api-gateway -n foo
`
	)
	.option("-a, --app <app name>", "Application name")
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.parse(process.argv);

const namespace = program.opts().namespace;
const app = program.opts().app;

validateRequiredArg(app, program, "Missing app name");
validateRequiredArg(namespace, program, "Namespace is required when destroying an app");

async function run() {
	try {
		const confirm = await confirmPrompt("DANGER: Are you sure you want to remove " + app + "?", false);

		if (confirm) {
			await deleteDeployment(namespace, app);
			log.info("Removed deployment");
			await deleteSecret(namespace, app + "-config");
			log.info("Removed config");
			await deleteReplicaSet(namespace, app);
			log.info("Removed replica set");
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
