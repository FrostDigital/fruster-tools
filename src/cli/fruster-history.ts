#!/usr/bin/env node

import { program } from "commander";
import moment from "moment";
import { getReplicaSets } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";
import { printTable, validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`
Get release history of an app.

Example:

$ fctl history -a api-gateway -n my-namespace
`
	)
	.option("-n, --namespace <namespace>", "namespace app is in")
	.option("-a, --app <app>", "name of service")
	.parse(process.argv);

const serviceName = program.opts().app;
const namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	const replicaSets = await getReplicaSets(namespace, serviceName);

	const changeCauses = (replicaSets || [])
		.map((rs) => {
			const image = rs.spec.template.spec.containers[0].image;
			const [_imageName, imageTag] = image.split(":");

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
