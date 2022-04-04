#!/usr/bin/env node

import chalk from "chalk";
import { program } from "commander";
import { getDeployments } from "../kube/kube-client";
import * as log from "../log";
import { ensureLength } from "../utils";
import { printTable } from "../utils/cli-utils";

program
	.description(
		`Lists all apps.

Examples:

$ fctl apps

`
	)
	.option("-n, --namespace <namespace>", "filter by kubernetes namespace")
	.parse(process.argv);

const namespace = program.getOptionValue("namespace");

async function run() {
	listApps();
}

async function listApps() {
	const deployments = await getDeployments(namespace);

	const deploymentsChoices = deployments.items.map(
		(d: any) =>
			`${ensureLength(d.metadata.name, 20)} ${ensureLength(d.metadata.namespace, 20)} ${
				d.status.readyReplicas || 0
			}/${d.spec.replicas}`
	);

	log.info(`${chalk.magenta(`Found ${deploymentsChoices.length} app(s)`)}`);

	const tableData = deployments.items.map((item: any) => {
		return [
			item.metadata.name,
			item.metadata.namespace,
			`${item.status.readyReplicas || 0}/${item.spec.replicas}`,
			item.status.unavailableReplicas ? item.status.unavailableReplicas + " unavailable" : " ",
		];
	});

	if (!tableData.length) {
		log.warn(`No apps found ${namespace ? "in namespace " + namespace : ""}`);
	} else {
		printTable(tableData, ["Name", "Namespace", "Running", ""]);
	}
}

run();
