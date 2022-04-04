#!/usr/bin/env node

import { program } from "commander";
import { patchDeployment } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";
import { getUsername, validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`Restart application.

Example:

$ fctl restart -a api-gateway -n my-namespace
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace app is in")
	.option("-a, --app <app>", "name of app")
	.parse(process.argv);

const appName = program.opts().app;
let namespace = program.opts().namespace;

validateRequiredArg(appName, program, "Missing app name");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	const username = await getUsername();

	await patchDeployment(namespace, appName, {
		metadata: {
			annotations: {
				[CHANGE_CAUSE_ANNOTATION]: `${username} restarted app`,
			},
		},
		spec: { template: { metadata: { annotations: { restart: "true" } } } },
	});

	log.info(`Restarting ${appName}, check progress with "fctl apps"`);
}

run();
