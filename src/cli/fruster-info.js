#!/usr/bin/env node

const program = require("commander");
const { getDeployment, getPods, getService } = require("../kube/kube-client");
const { validateRequiredArg, getOrSelectNamespace, printTable } = require("../utils/cli-utils");
const moment = require("moment");
const { FRUSTER_LIVENESS_ANNOTATION, ROUTABLE_ANNOTATION, DOMAINS_ANNOTATION } = require("../kube/kube-constants");
const { parseImage } = require("../utils/string-utils");
const log = require("../log");

program
	.description(
		`
Show info about an application.

Example:

$ fruster info -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const serviceName = program.app;
let namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	// Fetch stuff
	const deployment = await getDeployment(namespace, serviceName);
	const pods = await getPods(namespace, serviceName);
	const service = await getService(namespace, serviceName);

	// Deep dive into objects to pin point relevant data
	const { creationTimestamp, annotations } = deployment.metadata;
	const container = deployment.spec.template.spec.containers[0];
	const { limits, requests } = container.resources;
	const creation = moment(creationTimestamp);
	const { imageName, imageTag } = parseImage(container.image);

	const { [FRUSTER_LIVENESS_ANNOTATION]: livenesHealthcheck, [ROUTABLE_ANNOTATION]: routable } = annotations;

	const { [DOMAINS_ANNOTATION]: domains } = service ? service.metadata.annotations : "";

	const podInfo = pods.map((pod, i) => {
		const [lastContainerStatus] = pod.status.containerStatuses;
		const { imageName, imageTag } = parseImage(pod.spec.containers[0].image);
		const { state } = lastContainerStatus;

		let containerStatusDescription = " ";
		let since = " ";

		if (state.waiting && ["ImagePullBackOff", "ErrImagePull"].includes(state.waiting.reason)) {
			containerStatusDescription = `Failed to pull image ${imageName}:${imageTag}`;
		} else if (state.running) {
			containerStatusDescription = `✅`;

			since = moment(state.running.startedAt).fromNow().replace("minutes", "min");
		} else if (state.terminated) {
			containerStatusDescription = `💥`;

			since = moment(state.terminated.startedAt).fromNow().replace("minutes", "min");
		} else {
			containerStatusDescription = JSON.stringify(state);
		}

		return [`Pod ${++i}:`, pod.metadata.name, imageTag, `${pod.status.phase}`, since, containerStatusDescription];
	});

	const tableModel = [];
	tableModel.push(
		["Name:", serviceName],
		["Namespace:", namespace],
		["Created:", `${creation.format("YYYY-MM-DD HH:mm")} (${creation.fromNow()})`],
		["", ""],
		["Routable:", service ? `Yes, port ${service.spec.ports[0].targetPort}` : "Not routable"],
		["Domain(s):", domains],
		["", ""],
		["Image:", imageName],
		["Image tag:", imageTag],
		["", ""],
		["Replicas:", deployment.spec.replicas],
		["Ready replicas:", deployment.status.readyReplicas || 0],
		["Unavailable replicas:", deployment.status.unavailableReplicas || 0],
		["", ""],
		["CPU request:", requests.cpu],
		["CPU limit:", limits.cpu],
		["Memory request:", requests.memory],
		["Memory limit:", limits.memory],
		["", ""],
		["Liveness healthcheck:", livenesHealthcheck || "none"],
		["", ""]
		// ["Update policy:", deployment.metadata.annotations["keel.sh/policy"]]
	);

	printTable(tableModel);

	if (podInfo.length) {
		printTable(podInfo);
	} else {
		log.warn("App has no pods");
	}

	log.info(
		`For more detailed information type:\n$ kubectl -n ${namespace} describe po --selector app=${serviceName}\n`
	);
}

run();
