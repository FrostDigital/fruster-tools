#!/usr/bin/env node

const { program } = require("commander");
const { getLogs, getPods } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespace } = require("../utils/cli-utils");
const inquirer = require("inquirer");
const moment = require("moment");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-l, --lines", "number of lines to show, defaults to 100")
	.option("-a, --app <serviceName>", "name of service")
	// .option("-f, --follow", "follow log stream")
	.option("-t, --tail <num>", "number of lines to show, defaults to 100")
	.description(
		`
View logs for an app.

Example:

$ fruster logs -a api-gateway

$ fruster logs -a api-gateway -l 500 -t
`
	)
	.parse(process.argv);

const serviceName = program.opts().app;
const tail = program.opts().tail;
// const follow = program.follow;
let namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const pods = await getPods(namespace, serviceName);
	let podName;

	if (!pods.length) {
		log.warn("Could not find pod for app " + serviceName);
		process.exit(1);
	} else if (pods.length > 1) {
		podName = await selectPod(pods);
	} else {
		podName = pods[0].metadata.name;
	}

	const logLines = await getLogs(namespace, podName, tail || 100);

	console.log(logLines);
}

/**
 *
 * @param {any[]} pods
 */
async function selectPod(pods) {
	const { podName } = await inquirer.prompt([
		{
			type: "list",
			name: "podName",
			choices: pods.map((pod) => {
				let status = "Unknown status";
				let age = "? s";

				if (pod.status) {
					status = pod.status.phase;
					age = moment(pod.status.startTime).fromNow();
				}

				return {
					value: pod.metadata.name,
					name: `${pod.metadata.name} (${status}, ${age})`,
				};
			}),
			message: "Select pod",
		},
	]);

	return podName;
}

run();
