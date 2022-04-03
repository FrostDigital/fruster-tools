#!/usr/bin/env node

const { program } = require("commander");
const { getReplicaSets } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg } = require("../utils/cli-utils");
const { printTable, getOrSelectNamespaceForApp } = require("../utils/cli-utils");
const moment = require("moment");
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");

program
	.description(
		`
Get release history of an app.

Example:

$ fctl history -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace app is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const serviceName = program.opts().app;
let namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespaceForApp(serviceName);
	}

	const replicaSets = await getReplicaSets(namespace, serviceName);

	const changeCauses = (replicaSets || [])
		.map((rs) => {
			const image = rs.spec.template.spec.containers[0].image;
			const [imageName, imageTag] = image.split(":");

			return {
				changeCause: (rs.metadata.annotations || {})[CHANGE_CAUSE_ANNOTATION],
				timestamp: new Date(rs.metadata.creationTimestamp),
				imageTag,
			};
		})
		.sort((rs1, rs2) => rs2.timestamp.getTime() - rs1.timestamp.getTime())
		.map(({ changeCause, timestamp, imageTag }) => {
			return [moment(timestamp).fromNow(), changeCause || "n/a", imageTag];
		});

	log.success(`Release history for ${serviceName} in namespace ${namespace}:\n`);
	printTable(changeCauses, ["AGE", "COMMENT ", "VERSION"]);
}

run();
