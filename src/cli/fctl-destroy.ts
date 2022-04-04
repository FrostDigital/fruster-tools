#!/usr/bin/env node

import { program } from "commander";
import { deleteDeployment, deleteReplicaSet, deleteService } from "../kube/kube-client";
import * as log from "../log";
import { confirmPrompt, validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`
Removes an app and all resources related to it.

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
