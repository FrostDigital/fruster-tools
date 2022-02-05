import chalk from "chalk";
import enquirer from "enquirer";
import moment from "moment";
import { terminal } from "terminal-kit";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { getLogs } from "../actions/get-logs";
import { updateConfig } from "../actions/update-config";
import { updateImage } from "../actions/update-image";
import * as dockerHubClient from "../docker/DockerHubClient";
import * as dockerRegistryClient from "../docker/DockerRegistryClient";
import {
	getConfig,
	getDeployment,
	getDeployments,
	getPods,
	getService,
	scaleDeployment,
	updateDeployment,
} from "../kube/kube-client";
import { DOMAINS_ANNOTATION, FRUSTER_LIVENESS_ANNOTATION, ROUTABLE_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";
import { Deployment, Resources } from "../models/Deployment";
import { ensureLength } from "../utils";
import { clearScreen, formPrompt, pressEnterToContinue, printTable, sleep } from "../utils/cli-utils";
import {
	humanReadableResources,
	parseImage,
	prettyPrintPods,
	validateCpuResource,
	validateMemoryResource,
} from "../utils/string-utils";
import { createApp } from "./create-app";
import { backChoice, lockEsc, popScreen, pushScreen, resetScreen, separator } from "./engine";

// @ts-ignore: Does not exist in typings
const { NumberPrompt } = enquirer;

export async function apps() {
	const deployments = await getDeployments();

	const deploymentsChoices = deployments.items.map((d: any) => ({
		message: `${ensureLength(d.metadata.name, 20)} ${ensureLength(d.metadata.namespace, 20)} ${
			d.status.readyReplicas || 0
		}/${d.spec.replicas}`,
		name: d,
	}));

	log.info(
		`${chalk.magenta(`Found ${deploymentsChoices.length} app(s)`)}\nSelect with arrow keys and press enter\n\n`
	);

	const { app } = await enquirer.prompt<{ app: any }>([
		{
			type: "select",
			name: "app",
			message: `${ensureLength("App", 20)} ${ensureLength("Namespace", 20)} Running`,
			choices: [
				...deploymentsChoices,
				separator,
				{ message: chalk.green("+ Create app"), name: "createApp" },
				backChoice,
			],
		},
	]);

	if (app === "back") {
		popScreen();
	} else if (app === "createApp") {
		pushScreen({
			render: createApp,
			escAction: "back",
		});
	} else if (app) {
		pushScreen({
			props: app,
			render: viewApp,
			escAction: "back",
		});
	}
}

async function viewApp(deployment: Deployment) {
	const { name, namespace } = deployment.metadata;

	deployment = await getDeployment(namespace, name);
	const service = await getService(namespace, name);

	const container = deployment.spec.template.spec.containers[0];
	const { imageTag } = parseImage(container.image);

	terminal.defaultColor("> Selected app ").green(name + "\n\n");

	const { action } = await enquirer.prompt<{ action: string }>({
		type: "select",
		name: "action",
		message: " App menu",
		choices: [
			separator,
			{
				message: "View details",
				name: "info",
			},
			{
				message: `${ensureLength("Config", 25)}`,
				name: "config",
			},
			{
				message: `${ensureLength("Deploy new version", 25)} ${chalk.magenta(imageTag)}`,
				name: "version",
			},
			{
				message: `${ensureLength("Scale", 25)} ${chalk.magenta(deployment.spec.replicas + " replica(s)")}`,
				name: "scale",
			},
			{
				message: `${ensureLength("Domains", 25)} ${
					service
						? chalk.magenta(service.metadata.annotations[DOMAINS_ANNOTATION])
						: chalk.dim("Not routable")
				}`,
				name: "domains",
			},
			{
				message: `${ensureLength("Resource limits", 25)} ${chalk.magenta(humanReadableResources(deployment))}`,
				name: "resources",
			},
			separator,
			backChoice,

			// TODO: Health check
			// TODO: Delete?
		],
	});

	switch (action) {
		case "info":
			pushScreen({
				render: showInfo,
				props: deployment,
				name: "showInfo",
				// escAction: "back",
			});

			break;
		case "config":
			pushScreen({
				render: editConfig,
				props: deployment,
				name: "editConfig",
				escAction: "back",
			});
			break;
		case "version":
			pushScreen({
				render: changeVersion,
				props: deployment,
				name: "changeVersion",
				escAction: "back",
			});
			break;
		case "scale":
			pushScreen({
				render: scale,
				props: deployment,
				name: "scale",
				escAction: "back",
			});
			break;
		case "domains":
			pushScreen({
				render: changeDomains,
				props: deployment,
				name: "changeDomains",
				escAction: "back",
			});
			break;
		case "resources":
			pushScreen({
				render: resources,
				props: deployment,
				name: "resources",
				escAction: "back",
			});
			break;
		default:
			popScreen();
			break;
	}
}

async function showInfo(deployment: any) {
	const { name, namespace } = deployment.metadata;

	log.info(`Loading ${name} configuration...`);

	// Fetch stuff
	const pods = await getPods(namespace, name);
	const service = await getService(namespace, name);

	clearScreen();

	terminal.defaultColor("> Showing details for ").green(name + "\n\n");

	// Deep dive into objects to pin point relevant data
	const { creationTimestamp, annotations } = deployment.metadata;
	const container = deployment.spec.template.spec.containers[0];
	const { limits, requests } = container.resources;
	const creation = moment(creationTimestamp);
	const { imageName, imageTag } = parseImage(container.image);

	const { [FRUSTER_LIVENESS_ANNOTATION]: livenesHealthcheck, [ROUTABLE_ANNOTATION]: routable } = annotations;

	const { [DOMAINS_ANNOTATION]: domains } = service ? service.metadata.annotations : "";

	const tableModel = [];
	tableModel.push(
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
	);

	printTable(tableModel);

	prettyPrintPods(pods);

	await getLogs(name, namespace, { lines: 10 });

	log.info(`For more detailed information type:\n$ kubectl -n ${namespace} describe po --selector app=${name}\n`);

	console.log("\n-----------------------\n");

	await pressEnterToContinue();

	popScreen();
}

async function editConfig(deployment: any) {
	const { name, namespace } = deployment.metadata;
	const config = await getConfig(namespace, name);

	terminal.defaultColor("> Showing config for ").green(name + "\n\n");

	if (!config) {
		log.warn(`Could not find config for '${name}', does the app exist?`);
		return process.exit(1);
	}

	printTable(Object.keys(config).map((k) => [chalk.dim(k), config[k]]));

	const { configAction } = await enquirer.prompt<{ configAction: any }>({
		type: "select",
		name: "configAction",
		message: "Select action",
		choices: [
			separator,
			{ message: chalk.magenta("⚙️ Edit config"), name: "edit" },
			{ message: chalk.green("+ Add row"), name: "add" },
			{ message: chalk.grey("⏎ Go back"), name: "back" },
		],
	});

	if (configAction === "back") {
		popScreen();
	} else if (configAction === "add") {
		pushScreen({
			render: addConfigRow,
			props: deployment,
			escAction: "back",
		});
	} else if (configAction === "edit") {
		pushScreen({
			escAction: "back",
			render: editConfigRow,
			props: { deployment, config },
		});
	}
}

async function editConfigRow({ deployment, config }: { deployment: any; config: any }) {
	const { name, namespace } = deployment.metadata;

	const updatedConfig = await formPrompt<{ [x: string]: string }>({
		message: "Edit config",
		hint: "Enter blank space to remove row",
		choices: Object.keys(config).map((k) => ({
			name: k,
			message: k,
			initial: config[k],
		})),
	});

	if (JSON.stringify(config) === JSON.stringify(updatedConfig)) {
		log.info("\nNothing has changed");
		await sleep(1000);
		popScreen();
	} else {
		const changes = await updateConfig(
			name,
			namespace,
			Object.keys(updatedConfig).map((key) => ({ key, value: updatedConfig[key] }))
		);
		log.success(
			`\n✅ Updated config\n - Added ${changes.added.join(", ") || "n/a"}\n - Updated ${
				changes.updated.join(", ") || "n/a"
			}\n - Removed ${changes.removed.join(", ") || "n/a"}\n`
		);
		await sleep(3000);
		popScreen();
	}
}

async function addConfigRow(deployment: any) {
	const { name, namespace } = deployment.metadata;

	const { newConfig } = await enquirer.prompt<{ newConfig: string }>({
		type: "input",
		name: "newConfig",
		message: `Enter config, example ${chalk.dim("FOO=bar")}:`,
	});

	const [key, value] = newConfig.split("=");

	if (key && value) {
		await updateConfig(name, namespace, [{ key: key.trim(), value: value.trim() }]);
		log.success(`✅ Updated config ${key}\n`);
		await sleep(1000);
		popScreen();
	} else {
		log.error("Invalid config, enter on format KEY=value");
		await sleep(2000);
		popScreen();
	}
}

async function changeVersion(deployment: any) {
	const { name, namespace } = deployment.metadata;
	const image = deployment.spec.template.spec.containers[0].image;
	const registries = await getDockerRegistries(namespace);

	const { imageName, imageTag, registry, org } = parseImage(image);

	let choices = [];

	if (registry) {
		const selectedRegistryAuth = registries.find((r) => r.registryHost === registry);
		choices = (
			await dockerRegistryClient.listTags(selectedRegistryAuth?.dockerAuthToken as string, registry, imageName)
		).map((t) => ({
			message: `${ensureLength(t, 20)} ${imageTag === t ? chalk.green("current") : ""}`,
			name: t,
		}));
	} else {
		choices = await (
			await dockerHubClient.listTags(org, imageName)
		).map((t) => ({
			message: `${ensureLength(t, 20)} ${imageTag === t ? chalk.green("current") : ""}`,
			name: t,
		}));
	}

	choices = [...choices, separator, backChoice];

	const { newTag } = await enquirer.prompt<{ newTag: string }>({
		type: "select",
		name: "newTag",
		message: "Select tag:",
		choices,
	});

	if (newTag === "back") {
		popScreen();
	} else {
		lockEsc();
		await updateImage(name, namespace, newTag, true);
		await pressEnterToContinue();
		popScreen();
	}
}

async function scale(deployment: any) {
	const { name, namespace } = deployment.metadata;

	const replicas = await new NumberPrompt({
		message: "Number of replicas",
		name: "replicas",
		initial: deployment.spec.replicas,
	}).run();

	lockEsc();
	if (!(await scaleDeployment(namespace, name, replicas))) {
		log.warn("Failed to scale deployment");
		await pressEnterToContinue();
	} else {
		log.success(`✅ Scaled from ${deployment.spec.replicas} -> ${replicas} replica(s)`);
		await sleep(2000);
	}

	popScreen();
}

async function changeDomains(deployment: any) {
	const { name, namespace } = deployment.metadata;
	const service = await getService(namespace, name);
	const { [DOMAINS_ANNOTATION]: domains } = service ? service.metadata.annotations : "";

	const { domainAction } = await enquirer.prompt<{ domainAction: string }>({
		type: "select",
		message: "Domains",
		name: "domainAction",

		choices: [
			...(domains || "").split(",").map((d: string) => ({
				message: d,
				name: d,
			})),
			separator,
			{
				message: chalk.green("+ Add domain"),
				name: "add",
			},
			{
				message: chalk.red("x Make non-routable"),
				name: "makeNonRoutable",
			},
			separator,
			backChoice,
		],
	});

	if (domainAction === "back") {
		popScreen();
	}
}

async function resources(deployment: Deployment) {
	const { name, namespace } = deployment.metadata;

	console.log();
	console.log(
		`${chalk.magenta("Requests")} is what the pod ${chalk.underline(
			"wants"
		)} to use.\nIf the cluster has more resources on its hand,\nkubernetes might allow even more resources.`
	);
	console.log();
	console.log(
		`${chalk.magenta(
			"Limits"
		)} is the hard limit that a pod cannot exceed.\nIf exceeded kubernetes will kill and reschedule the pod.`
	);
	console.log();

	const existingResources: Resources | undefined = deployment.spec.template.spec.containers[0].resources;

	const newResources = await formPrompt<{ cpuReq: string; cpuLimit: string; memReq: string; memLimit: string }>({
		message: "Set resource limit and requests",
		hint: "<TAB> to change focus and <Enter> to submit",
		choices: [
			{
				name: "cpuReq",
				message: "CPU request (in cores or milliCPU)",
				initial: existingResources?.requests?.cpu,
				validate: (value) => validateCpuResource(value) || "Invalid CPU request - enter on format 500m or 0.5",
			},
			{
				name: "cpuLimit",
				message: "CPU limit (in cores or milliCPU)",
				initial: existingResources?.limits?.cpu,
				validate: (value) => validateCpuResource(value) || "Invalid CPU limit - enter on format 500m or 0.5",
			},
			{
				name: "memReq",
				message: "Memory request (in Mi/Gi)",
				initial: existingResources?.requests?.memory,
				validate: (value) => validateMemoryResource(value) || "Invalid memory request - enter on format 100Mi",
			},
			{
				name: "memLimit",
				message: "Memory limit (in Mi/Gi)",
				initial: existingResources?.limits?.memory,
				validate: (value) => validateMemoryResource(value) || "Invalid memory limit - enter on format 100Mi",
			},
		],
	});

	const newResourcesK8s: Resources = {
		limits: {
			cpu: newResources.cpuLimit,
			memory: newResources.memLimit,
		},
		requests: {
			cpu: newResources.cpuReq,
			memory: newResources.memReq,
		},
	};

	if (JSON.stringify(existingResources) === JSON.stringify(newResourcesK8s)) {
		log.success("Nothing changed...");
		await sleep(2000);
		popScreen();
	} else {
		deployment.spec.template.spec.containers[0].resources = newResourcesK8s;
		await updateDeployment(namespace, name, deployment);
		log.success("✅ Resources limits has been updated");
		await sleep(2000);
		popScreen();
	}
}
