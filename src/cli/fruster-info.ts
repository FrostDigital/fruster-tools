#!/usr/bin/env node

import { program } from "commander";
import moment from "moment";
import { getDeployment, getPods, getService } from "../kube/kube-client";
import { DOMAINS_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";
import { prettyPrintPods } from "../utils";
import { printTable, validateRequiredArg } from "../utils/cli-utils";
import { getDeploymentContainerResources, getDeploymentImage, getProbeString } from "../utils/kube-utils";
import { parseImage } from "../utils/string-utils";

program
	.description(
		`
Show info about an application.

Example:

$ fctl info -a api-gateway -n my-namespace
`
	)
	.option("-n, --namespace <namespace>", "namespace app is in")
	.option("-a, --app <app>", "name of app")
	.parse(process.argv);

const serviceName = program.opts().app;
const namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	// Fetch stuff
	const deployment = await getDeployment(namespace, serviceName);
	const pods = await getPods(namespace, serviceName);
	const service = await getService(namespace, serviceName);

	if (!deployment) {
		log.warn(`No deployment for app ${serviceName}`);
		return process.exit(1);
	}

	// Deep dive into objects to pin point relevant data
	const { creationTimestamp } = deployment?.metadata || {};
	// const container = deployment?.spec.template.spec.containers[0];
	const { limits, requests } = getDeploymentContainerResources(deployment) || {};
	const creation = moment(creationTimestamp);
	const { imageName, imageTag } = parseImage(getDeploymentImage(deployment));

	const domains = service ? (service?.metadata?.annotations || {})[DOMAINS_ANNOTATION] : "";

	const livenessStr = getProbeString(deployment, "liveness");

	const tableModel = [];
	tableModel.push(
		["Name:", serviceName],
		["Namespace:", namespace],
		["Created:", `${creation.format("YYYY-MM-DD HH:mm")} (${creation.fromNow()})`],
		["", ""],
		["Routable:", service ? `Yes, port ${(service.spec?.ports || [])[0].targetPort}` : "Not routable"],
		["Domain(s):", domains],
		["", ""],
		["Image:", imageName],
		["Image tag:", imageTag],
		["", ""],
		["Replicas:", deployment?.spec?.replicas],
		["Ready replicas:", deployment?.status?.readyReplicas || 0],
		["Unavailable replicas:", deployment?.status?.unavailableReplicas || 0],
		["", ""],
		["CPU request:", requests!.cpu],
		["CPU limit:", limits!.cpu],
		["Memory request:", requests!.memory],
		["Memory limit:", limits!.memory],
		["", ""],
		["Liveness healthcheck:", livenessStr || "none"],
		["", ""]
	);

	printTable(tableModel);

	prettyPrintPods(pods);

	log.info(
		`For more detailed information type:\n$ kubectl -n ${namespace} describe po --selector app=${serviceName}\n`
	);
}

run();
