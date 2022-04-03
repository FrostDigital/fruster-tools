#!/usr/bin/env node

import { program } from "commander";
import moment from "moment";
import { getDeployment, getPods, getService } from "../kube/kube-client";
import * as log from "../log";
import { prettyPrintPods } from "../utils";
import { getOrSelectNamespaceForApp, printTable, validateRequiredArg } from "../utils/cli-utils";
import { getDeploymentContainerResources, getDeploymentImage } from "../utils/kube-utils";
const { FRUSTER_LIVENESS_ANNOTATION, ROUTABLE_ANNOTATION, DOMAINS_ANNOTATION } = require("../kube/kube-constants");
const { parseImage } = require("../utils/string-utils");

program
	.description(
		`
Show info about an application.

Example:

$ fctl info -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const serviceName = program.opts().app;
let namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespaceForApp(serviceName);
	}

	// Fetch stuff
	const deployment = await getDeployment(namespace, serviceName);
	const pods = await getPods(namespace, serviceName);
	const service = await getService(namespace, serviceName);

	if (!deployment) {
		log.warn(`No deployment for app ${serviceName}`);
		return process.exit(1);
	}

	// Deep dive into objects to pin point relevant data
	const { creationTimestamp, annotations } = deployment?.metadata || {};
	// const container = deployment?.spec.template.spec.containers[0];
	const { limits, requests } = getDeploymentContainerResources(deployment) || {};
	const creation = moment(creationTimestamp);
	const { imageName, imageTag } = parseImage(getDeploymentImage(deployment));

	const { [FRUSTER_LIVENESS_ANNOTATION]: livenesHealthcheck, [ROUTABLE_ANNOTATION]: routable } = annotations!;

	const domains = service ? (service?.metadata?.annotations || {})[DOMAINS_ANNOTATION] : "";

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
		["Liveness healthcheck:", livenesHealthcheck || "none"],
		["", ""]
		// ["Update policy:", deployment.metadata.annotations["keel.sh/policy"]]
	);

	printTable(tableModel);

	prettyPrintPods(pods);

	log.info(
		`For more detailed information type:\n$ kubectl -n ${namespace} describe po --selector app=${serviceName}\n`
	);
}

run();
