#!/usr/bin/env node

import { program } from "commander";
import { syncApps } from "../actions/sync-apps";
import { getNamespace } from "../kube/kube-client";
import * as log from "../log";
import { validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`Applies config in as service registry file to kubernetes deployment(s).

Examples:

$ fctl sync -n my-namespace services.json
`
	)
	.option("-y, --yes", "perform the change directly, will otherwise run in interactive mode")
	.option("-n, --namespace <namespace>", "kubernetes namespace to where apps will be synced")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const namespaceArg = program.getOptionValue("namespace");
const interactive = !program.getOptionValue("yes");

validateRequiredArg(serviceRegPath, program, "Missing service registry path");
validateRequiredArg(namespaceArg, program, "Missing namespace");

async function run() {
	try {
		if (!(await getNamespace(namespaceArg))) {
			log.error(`Namespace '${namespaceArg}' does not exist`);
			process.exit(1);
		}

		await syncApps(namespaceArg, serviceRegPath, interactive);
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
