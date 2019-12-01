#!/usr/bin/env node

const program = require("commander");
const { getReplicaSets } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg } = require("../lib/utils/cli-utils");
const { printTable, getOrSelectNamespace } = require("../lib/utils/cli-utils");
const moment = require("moment");

program
	.description(
		`
Get release history of an app.

Example:

$ fruster history -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace app is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const serviceName = program.app;
let namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const replicaSets = await getReplicaSets(namespace, serviceName);

	const changeCauses = replicaSets
		.map(rs => {
			const image = rs.spec.template.spec.containers[0].image;
			const [imageName, imageTag] = image.split(":");
			return {
				changeCause: (rs.spec.template.metadata.annotations || {})["kubernetes.io/change-cause"],
				timestamp: new Date(rs.metadata.creationTimestamp),
				imageTag
			};
		})
		.sort((rs1, rs2) => rs2.timestamp.getTime() - rs1.timestamp.getTime())
		.map(({ changeCause, timestamp, imageTag }) => {
			return [moment(timestamp).fromNow(), changeCause || "n/a", imageTag];
		});

	log.success(`Release history for ${serviceName} in namespace ${namespace}:\n`);
	printTable(changeCauses);
	// if (replicas === undefined) {
	// 	const pods = await getPods(namespace, serviceName);
	// 	log.info(`Service has ${pods.length} pods, set --replicas to scale replicas`);
	// } else if (await scaleDeployment(namespace, serviceName, replicas)) {
	// 	log.success(`Deployment ${serviceName} scaled to ${replicas} replicas`);
	// }
}

run();
