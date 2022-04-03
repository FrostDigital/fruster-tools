#!/usr/bin/env node

import { program } from "commander";
import { validateRequiredArg, getOrSelectNamespaceForApp } from "../utils/cli-utils";
import { followLogs } from "../actions/follow-logs";

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	// .option("-l, --lines", "number of lines to show, defaults to 100")
	.option("-a, --app <serviceName>", "name of service")
	// .option("-f, --follow", "follow log stream")
	// .option("-t, --tail <num>", "number of lines to show, defaults to 100")
	.description(
		`
View logs for an app.

Example:

$ fctl logs -a api-gateway

$ fctl logs -a api-gateway -l 500 -t
`
	)
	.parse(process.argv);

const serviceName = program.opts().app;
// const tail = program.opts().tail;
// const follow = program.follow;
let namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespaceForApp(serviceName);
	}

	await followLogs(namespace, serviceName);

	// const pods = await getPods(namespace, serviceName);
	// let podName;

	// if (!pods.length) {
	// 	log.warn("Could not find pod for app " + serviceName);
	// 	process.exit(1);
	// } else if (pods.length > 1) {
	// 	podName = await selectPod(pods);
	// } else {
	// 	podName = pods[0].metadata.name;
	// }

	// const logLines = await getLogs(namespace, podName, tail || 100);

	// console.log(logLines);
}

run();
