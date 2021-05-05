#!/usr/bin/env node

const program = require("commander");
const { getDeployments } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { printTable } = require("../lib/utils/cli-utils");

program
	.description(
		`
Lists all fruster apps.

Examples:

$ fruster apps

`
	)
	.option("-n, --namespace <namespace>", "filter by kubernetes namespace")
	.parse(process.argv);

const namespace = program.namespace;

async function run() {
	try {
		const deployments = await getDeployments(namespace);

		const tableData = deployments.items.map(item => {
			return [
				item.metadata.name,
				item.metadata.namespace,
				`${item.status.readyReplicas || 0}/${item.spec.replicas}`,
				item.status.unavailableReplicas ? item.status.unavailableReplicas + " unavailable" : " "
			];
		});

		printTable(tableData);

		log.info(`${tableData.length} app(s)`);
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
