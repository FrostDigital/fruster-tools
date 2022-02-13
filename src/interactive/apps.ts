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
	deleteDeployment,
	deleteSecret,
	deleteService,
	ensureServiceForApp,
	getConfig,
	getConfigMap,
	getConfigNameFromServiceName,
	getDeployment,
	getDeployments,
	getPods,
	getSecret,
	getService,
	scaleDeployment,
	setConfig,
	updateConfigMap,
	updateDeployment,
} from "../kube/kube-client";
import { DOMAINS_ANNOTATION, FRUSTER_LIVENESS_ANNOTATION, ROUTABLE_ANNOTATION } from "../kube/kube-constants";
import { configMap, GLOBAL_CONFIG_NAME, GLOBAL_SECRETS_NAME } from "../kube/kube-templates";
import * as log from "../log";
import { Deployment, Resources } from "../models/Deployment";
import { ensureLength } from "../utils";
import {
	clearScreen,
	confirmPrompt,
	editConfigInEditor,
	EDIT_GLOBAL_CONFIG_WARNING,
	formPrompt,
	pressEnterToContinue,
	printConfigChanges,
	printTable,
	sleep,
} from "../utils/cli-utils";
import {
	humanReadableResources,
	maskStr,
	parseImage,
	prettyPrintPods,
	validateCpuResource,
	validateMemoryResource,
} from "../utils/string-utils";
import { createApp } from "./create-app";
import { backChoice, lockEsc, popScreen, pushScreen, separator } from "./engine";

// @ts-ignore: Does not exist in typings
const { NumberPrompt } = enquirer;

export async function apps() {
	console.log("Loadings apps...");
	const deployments = await getDeployments();

	clearScreen();

	const deploymentsChoices = deployments.items.map((d) => ({
		message: `${ensureLength(d.metadata.name, 40)} ${ensureLength(d.metadata.namespace, 20)} ${
			d.status?.readyReplicas || 0
		}/${d.spec.replicas}`,
		name: d.metadata.namespace + "." + d.metadata.name,
	}));

	log.info(
		`${chalk.magenta(`Found ${deploymentsChoices.length} app(s)`)}\nSelect with arrow keys and press enter\n\n`
	);

	const { app } = await enquirer.prompt<{ app: any }>([
		{
			type: "select",
			name: "app",
			message: `${ensureLength("App", 40)} ${ensureLength("Namespace", 20)} Running`,
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
		const deployment = deployments.items.find((d) => d.metadata.namespace + "." + d.metadata.name === app);

		pushScreen({
			props: deployment,
			render: viewApp,
			escAction: "back",
		});
	}
}

async function viewApp(deployment: Deployment) {
	console.log("Gathering app details...");

	const { name, namespace } = deployment.metadata;

	deployment = (await getDeployment(namespace, name)) as Deployment;
	const service = await getService(namespace, name);

	clearScreen();

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
					service?.metadata.annotations
						? chalk.magenta(service.metadata.annotations[DOMAINS_ANNOTATION])
						: chalk.dim("Not routable")
				}`,
				name: "domains",
			},
			{
				message: `${ensureLength("Resource limits", 25)} ${chalk.magenta(humanReadableResources(deployment))}`,
				name: "resources",
			},
			{
				message: chalk.red("Delete app"),
				name: "delete",
			},
			separator,
			backChoice,

			// TODO: Health check
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
		case "delete":
			deleteApp(deployment);
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

	const domains = service?.metadata.annotations ? service.metadata.annotations[DOMAINS_ANNOTATION] : "";

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
	let config = await getConfig(namespace, name);

	terminal.defaultColor("> Showing config for ").green(name + "\n\n");

	if (!config) {
		log.warn(`Could not find config for '${name}.${namespace}', creating empty config...\n`);
		await setConfig(namespace, name, {});
		config = {};
	}

	const globalConfig = await getConfigMap(namespace, GLOBAL_CONFIG_NAME);
	const globalSecrets = await getSecret(namespace, GLOBAL_SECRETS_NAME);

	let tableData: string[][] = [];
	const tableHeaders = ["Key (scope)", "Value"];

	if (Object.keys(globalConfig?.data || {}).length) {
		tableData.push(
			...Object.keys(globalConfig?.data || {}).map((k) => [
				chalk.bold(chalk.cyan(k)) + chalk.dim(" (GC)"),
				globalConfig!.data![k],
			])
		);
	}

	if (Object.keys(globalSecrets?.data || {}).length) {
		tableData.push(
			...Object.keys(globalSecrets?.data || {}).map((k) => [
				chalk.bold(chalk.cyan(k)) + chalk.dim(" (GS)"),
				maskStr(globalSecrets!.data![k]),
			])
		);
	}

	tableData.push(...Object.keys(config).map((k) => [chalk.bold(chalk.cyan(k)), config![k]]));

	printTable(tableData, tableHeaders, true);

	console.log(chalk.dim(chalk.italic("GC = Global config, GS = Global secret, [NONE] = App config")));
	console.log();

	const { configAction } = await enquirer.prompt<{ configAction: any }>({
		type: "select",
		name: "configAction",
		message: "Select action",
		choices: [
			separator,
			{ message: "◎ Edit app config", name: "edit" },
			{
				message: "○ Edit global config",
				name: "editGlobalConfig",
			},
			separator,
			{ message: chalk.grey("⏎ Go back"), name: "back" },
		],
	});

	if (configAction === "back") {
		popScreen();
	} else if (configAction === "edit") {
		pushScreen({
			escAction: "back",
			render: doEditConfig,
			props: { deployment, config },
		});
	} else if (configAction === "editGlobalConfig") {
		pushScreen({
			escAction: "back",
			render: doEditConfig,
			props: { deployment, config: globalConfig?.data || {}, isGlobal: true },
		});
	}
}

async function doEditConfig({ deployment, config, isGlobal }: { deployment: any; config: any; isGlobal?: boolean }) {
	const { name, namespace } = deployment.metadata;

	const updatedConfig = await editConfigInEditor(config, isGlobal ? EDIT_GLOBAL_CONFIG_WARNING : undefined);

	if (JSON.stringify(config) === JSON.stringify(updatedConfig)) {
		log.info("\nNothing has changed");
		await sleep(1000);
		popScreen();
	} else {
		printConfigChanges(config, updatedConfig);

		if (await confirmPrompt("Do you want to save config?", true)) {
			if (isGlobal) {
				await updateConfigMap(
					namespace,
					GLOBAL_CONFIG_NAME,
					configMap(namespace, GLOBAL_CONFIG_NAME, updatedConfig)
				);
			} else {
				await updateConfig(name, namespace, updatedConfig);
			}
			console.log();
			log.success(`✅ Config was updated`);
			await pressEnterToContinue();
		}

		popScreen();
	}
}

async function changeVersion(deployment: any) {
	console.log("Loading versions...");

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

	clearScreen();

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
		console.log();
		log.success(`✅ Scaled from ${deployment.spec.replicas} -> ${replicas} replica(s)`);
		await sleep(2000);
	}

	popScreen();
}

async function changeDomains(deployment: Deployment) {
	const { name, namespace } = deployment.metadata;
	const service = await getService(namespace, name);
	const domains = (service?.metadata.annotations || {})[DOMAINS_ANNOTATION] || "";

	if (!domains) {
		console.log(chalk.dim("App is not routable"));
		console.log();
	}

	const addDomainChoice = {
		message: chalk.green("+ Add domain"),
		name: "add",
	};

	const choicesWhenRoutable = [
		...(domains || "").split(",").map((d: string) => ({
			message: `${ensureLength(d, 40)} ${chalk.red("x Remove")}`,
			name: d,
		})),
		separator,
		addDomainChoice,
		{
			message: chalk.red("x Make non-routable"),
			name: "makeNonRoutable",
		},
		separator,
		backChoice,
	];

	const choicesWhenNotRoutable = [separator, addDomainChoice, separator, backChoice];

	const { domainAction } = await enquirer.prompt<{ domainAction: string }>({
		type: "select",
		message: "Domains",
		name: "domainAction",
		choices: domains ? choicesWhenRoutable : choicesWhenNotRoutable,
	});

	if (domainAction === "back") {
		popScreen();
	} else if (domainAction === "add") {
		pushScreen({
			render: addDomain,
			props: { deployment, existingDomains: domains },
			escAction: "back",
		});
	} else if (domainAction === "makeNonRoutable") {
		pushScreen({
			render: makeNonRoutable,
			props: deployment,
			escAction: "back",
		});
	} else {
		pushScreen({
			render: removeDomain,
			props: { deployment, domain: domainAction, existingDomains: domains },
			// escAction: "back",
		});
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

	console.log(); // newline

	if (JSON.stringify(existingResources) === JSON.stringify(newResourcesK8s)) {
		log.success("Nothing changed...");
		await pressEnterToContinue();
		popScreen();
	} else {
		deployment.spec.template.spec.containers[0].resources = newResourcesK8s;
		await updateDeployment(namespace, name, deployment);
		log.success("✅ Resources limits has been updated");
		await pressEnterToContinue();
		popScreen();
	}
}

async function addDomain({ deployment, existingDomains }: { deployment: Deployment; existingDomains: string }) {
	lockEsc();

	const { namespace, name } = deployment.metadata;

	if (!existingDomains) {
		console.log();
		console.log("App is currently not configured to be routable.");
		console.log(chalk.dim("A k8s service needs to be created and attached to the app."));
		console.log();
		const answer = await confirmPrompt("Do you want to make app routable?", true);

		if (!answer) return popScreen();
	}

	console.log();
	console.log(
		"Enter one or more domain names. If no top level domain is\nentered, the same TLD as the router will be used."
	);
	console.log();

	const { domains } = await enquirer.prompt<{ domains: string }>({
		type: "input",
		name: "domains",
		initial: existingDomains ? "" : name,
		message: "Enter domain names, separate with comma",
		validate: (val) => val.trim().length > 0 || "Invalid domain name",
	});

	if (!domains) {
		console.log("Nothing changed...");
		return popScreen();
	}

	let parsedDomains = domains.split(",").map((d) => d.trim());

	if (existingDomains) {
		parsedDomains = [...existingDomains.split(","), ...parsedDomains];
	}

	let config = await getConfig(namespace, name);

	if (!config?.PORT) {
		log.warn(`App is missing config PORT which is required to make app routable`);

		const { port } = await enquirer.prompt<{ port: number }>({
			type: "input",
			name: "port",
			initial: 3000,
			message: "Enter port app is exposing for HTTP/TCP",
			validate: (val) => !Number.isNaN(val) && Number(val) > 0,
		});

		config = { ...config, PORT: String(port) };

		await setConfig(namespace, name, config);
	}

	await ensureServiceForApp(namespace, { name, domains: parsedDomains, port: config.PORT });

	console.log();
	log.success("✅ Domain(s) was updated");
	console.log(
		chalk.dim(
			`Any TCP traffic to domain(s) ${parsedDomains.join(", ")} will be routed to the app on port ${config.PORT}`
		)
	);
	console.log();
	await pressEnterToContinue();
	popScreen();
}

async function removeDomain({
	deployment,
	domain,
	existingDomains,
}: {
	deployment: Deployment;
	domain: string;
	existingDomains: string;
}) {
	lockEsc();

	const { name, namespace } = deployment.metadata;

	const confirm = await confirmPrompt(`Are you sure you want to remove domain ${domain}?`);

	if (!confirm) return popScreen();

	const config = await getConfig(namespace, name);

	if (!config) {
		throw new Error("Missing config for app");
	}

	let updatedDomains = existingDomains.split(",").filter((d) => d !== domain);

	await ensureServiceForApp(namespace, { name, domains: updatedDomains, port: config.PORT });

	console.log();
	log.success(`✅ Domain ${domain} was removed`);
	console.log();
	await pressEnterToContinue();
	popScreen();
}

async function makeNonRoutable(deployment: Deployment) {
	lockEsc();

	const { name, namespace } = deployment.metadata;

	const confirm = await confirmPrompt(`Are you sure you want to make app non routable?`);

	if (!confirm) return popScreen();

	console.log();
	console.log("Deleting k8s service...");
	console.log();
	await deleteService(namespace, name);

	console.log();
	log.success(`✅ App was updated`);
	console.log();
	await pressEnterToContinue();
	popScreen();
}

async function deleteApp(deployment: Deployment) {
	const { name, namespace } = deployment.metadata;

	const confirm = await confirmPrompt("Are you sure you want to delete the app?");

	if (!confirm) return popScreen();

	lockEsc();

	await deleteDeployment(namespace, name);
	await deleteService(namespace, name);
	await deleteSecret(namespace, getConfigNameFromServiceName(name));

	console.log();
	log.success(`✅ App was deleted`);
	await pressEnterToContinue();
	popScreen();
}
