import chalk from "chalk";
import enquirer from "enquirer";
import moment from "moment";
import { terminal } from "terminal-kit";
import { cloneApp } from "../actions/clone-app";
import { followLogs } from "../actions/follow-logs";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { getLogs } from "../actions/get-logs";
import { configRowsToObj, updateConfig } from "../actions/update-config";
import { updateImage } from "../actions/update-image";
import * as dockerHubClient from "../docker/DockerHubClient";
import * as dockerRegistryClient from "../docker/DockerRegistryClient";
import {
	createSecret,
	deleteDeployment,
	deleteSecret,
	deleteService,
	ensureServiceForApp,
	getConfigMap,
	getConfigNameFromServiceName,
	getDeployment,
	getDeployments,
	getPods,
	getSecret,
	getSecrets,
	getService,
	scaleDeployment,
	updateConfigMap,
	updateDeployment,
	updateService,
} from "../kube/kube-client";
import { CERT_ANNOTATION, DOMAINS_ANNOTATION } from "../kube/kube-constants";
import { configMap, GLOBAL_CONFIG_NAME, GLOBAL_SECRETS_NAME, secret } from "../kube/kube-templates";
import * as log from "../log";
import { Deployment, Resources } from "../models/Deployment";
import * as k8s from "@kubernetes/client-node";
import { ensureLength } from "../utils";
import {
	clearScreen,
	confirmPrompt,
	editConfigInEditor,
	EDIT_GLOBAL_CONFIG_WARNING,
	formPrompt,
	openEditor,
	pressEnterToContinue,
	printConfigChanges,
	printTable,
	sleep,
} from "../utils/cli-utils";
import {
	getDeploymentAppConfig,
	getDeploymentContainerResources,
	getDeploymentImage,
	getNameAndNamespaceOrThrow,
	getProbeString,
	humanReadableResources,
	parseProbeString,
	setAnnotation,
	setLabel,
	setProbe,
	updateDeploymentContainerResources,
} from "../utils/kube-utils";
import {
	base64encode,
	maskStr,
	parseImage,
	prettyPrintPods,
	validateCpuResource,
	validateMemoryResource,
} from "../utils/string-utils";
import { createApp } from "./create-app";
import { backChoice, lockEsc, popScreen, pushScreen, resetScreen, separator } from "./engine";
import { exportApps } from "./export-apps";
import { importApps } from "./import-apps";

// @ts-ignore: Does not exist in typings
const { NumberPrompt } = enquirer;

export async function apps() {
	console.log("Loadings apps...");
	const deployments = await getDeployments();

	clearScreen();

	const deploymentsChoices = deployments.items.map((d) => ({
		message: `${ensureLength(d.metadata?.name, 40)} ${ensureLength(d.metadata?.namespace, 20)} ${
			d.status?.readyReplicas || 0
		}/${d.spec?.replicas}`,
		name: d.metadata?.namespace + "." + d.metadata?.name,
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
				{ message: chalk.magentaBright("> Sync with service registry"), name: "importApps" },
				{ message: chalk.magentaBright("< Export service registry"), name: "exportApps" },
				separator,
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
	} else if (app === "importApps") {
		pushScreen({
			render: importApps,
			escAction: "back",
		});
	} else if (app === "exportApps") {
		pushScreen({
			render: exportApps,
			escAction: "back",
		});
	} else if (app) {
		const deployment = deployments.items.find((d) => d.metadata?.namespace + "." + d.metadata?.name === app);

		pushScreen({
			props: deployment,
			render: viewApp,
			escAction: "back",
		});
	}
}

async function viewApp(deployment: Deployment) {
	console.log("Gathering app details...");

	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

	deployment = (await getDeployment(namespace, name)) as Deployment;
	const service = await getService(namespace, name);

	clearScreen();

	const { imageTag } = parseImage(getDeploymentImage(deployment));

	terminal.defaultColor("> Selected app ").green(name + "\n\n");

	const { action } = await enquirer.prompt<{ action: string }>({
		type: "select",
		name: "action",
		message: "App menu",
		choices: [
			separator,
			{
				message: "View details",
				name: "info",
			},
			{
				message: "Logs",
				name: "logs",
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
				message: `${ensureLength("Scale", 25)} ${chalk.magenta(deployment.spec?.replicas + " replica(s)")}`,
				name: "scale",
			},
			{
				message: `${ensureLength("Domains", 25)} ${
					service?.metadata?.annotations
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
				message: `${ensureLength("Liveness probe", 25)} ${chalk.magenta(
					getProbeString(deployment, "liveness")
				)}`,
				name: "livenessProbe",
			},
			{
				message: `${ensureLength("Configure SSL", 25)} ${
					service?.metadata?.annotations
						? chalk.magenta(service?.metadata.annotations[CERT_ANNOTATION] || "none")
						: ""
				}`,
				name: "addSsl",
			},
			separator,
			{
				message: "Clone app",
				name: "clone",
			},
			{
				message: chalk.red("Delete app"),
				name: "delete",
			},
			separator,
			backChoice,
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
		case "addSsl":
			pushScreen({
				render: addSsl,
				props: deployment,
				name: "addSsl",
				escAction: "back",
			});
			break;
		case "livenessProbe":
			pushScreen({
				render: livenessProbe,
				props: deployment,
				escAction: "back",
			});
			break;
		case "delete":
			deleteApp(deployment);
			break;
		case "logs":
			pushScreen({
				render: viewLogs,
				props: deployment,
				//escAction: "back",
			});
			break;
		case "clone":
			pushScreen({
				render: clone,
				props: deployment,
				escAction: "back",
			});
			break;
		default:
			popScreen();
			break;
	}
}

async function showInfo(deployment: Deployment) {
	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

	log.info(`Loading ${name} configuration...`);

	// Fetch stuff
	const pods = await getPods(namespace, name);
	const service = await getService(namespace, name);

	clearScreen();

	terminal.defaultColor("> Showing details for ").green(name + "\n\n");

	// Deep dive into objects to pin point relevant data
	const { creationTimestamp } = deployment.metadata || {};
	const container = deployment.spec?.template.spec?.containers[0];
	const { limits, requests } = container?.resources || {};
	const creation = moment(creationTimestamp);
	const { imageName, imageTag } = parseImage(getDeploymentImage(deployment));

	const domains = service?.metadata?.annotations ? service.metadata.annotations[DOMAINS_ANNOTATION] : "";

	const livenessProbeStr = getProbeString(deployment, "liveness");

	const tableModel = [];
	tableModel.push(
		["Namespace:", namespace],
		["Created:", `${creation.format("YYYY-MM-DD HH:mm")} (${creation.fromNow()})`],
		["", ""],
		["Routable:", service ? `Yes, port ${(service.spec?.ports || [])[0].targetPort}` : "Not routable"],
		["Domain(s):", domains],
		["", ""],
		["Image:", imageName],
		["Image tag:", imageTag],
		["", ""],
		["Replicas:", deployment.spec?.replicas || ""],
		["Ready replicas:", deployment.status?.readyReplicas || 0],
		["Unavailable replicas:", deployment.status?.unavailableReplicas || 0],
		["", ""],
		["CPU request:", requests?.cpu || "n/a"],
		["CPU limit:", limits?.cpu || "n/a"],
		["Memory request:", requests?.memory || "n/a"],
		["Memory limit:", limits?.memory || "n/a"],
		["", ""],
		["Liveness healthcheck:", livenessProbeStr || "none"],
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

async function editConfig(deployment: Deployment) {
	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

	// Refresh deployment
	deployment = (await getDeployment(namespace, name)) as Deployment;

	const { config } = await getDeploymentAppConfig(deployment);

	terminal.defaultColor("> Showing config for ").green(name + "\n\n");

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

	tableData.push(...config.map((c) => [chalk.bold(chalk.cyan(c.name)), c.value || " "]));

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
			props: { deployment, config: configRowsToObj(config) },
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
			const hasPortChanged = config.PORT && updatedConfig.PORT && config.PORT !== updatedConfig.PORT;

			if (isGlobal) {
				await updateConfigMap(
					namespace,
					GLOBAL_CONFIG_NAME,
					configMap(namespace, GLOBAL_CONFIG_NAME, updatedConfig)
				);
			} else {
				await updateConfig({
					serviceName: name,
					namespace,
					set: updatedConfig,
				});
			}

			if (hasPortChanged) {
				const service = await getService(namespace, name);

				if (service) {
					const domains = ((service?.metadata?.annotations || {})[DOMAINS_ANNOTATION] || "").split(",");
					await ensureServiceForApp(namespace, { name, port: updatedConfig.PORT, domains });
					log.info(`Updated k8s service to use PORT ${updatedConfig.PORT}`);
				}
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
		const tags = await dockerHubClient.listTags({ org, repo: imageName });
		choices = tags.map((t) => ({
			message: `${ensureLength(t.name, 20)} ${chalk.dim(t.lastUpdated)} ${
				imageTag === t.name ? chalk.green("current") : ""
			}`,
			name: t.name,
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
	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

	const service = await getService(namespace, name);
	const domains = (service?.metadata?.annotations || {})[DOMAINS_ANNOTATION] || "";

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
		});
	}
}

async function resources(deployment: Deployment) {
	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

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

	const existingResources = getDeploymentContainerResources(deployment);

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
		updateDeploymentContainerResources(deployment, newResourcesK8s);
		await updateDeployment(namespace, name, deployment);
		await sleep(2000);
		log.success("✅ Resources limits has been updated");
		await pressEnterToContinue();
		popScreen();
	}
}

async function addDomain({ deployment, existingDomains }: { deployment: Deployment; existingDomains: string }) {
	lockEsc();

	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

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

	const { config } = await getDeploymentAppConfig(deployment);

	const configMap = configRowsToObj(config);

	if (!configMap?.PORT) {
		log.warn(`App is missing config PORT which is required to make app routable`);

		const { port } = await enquirer.prompt<{ port: number }>({
			type: "input",
			name: "port",
			initial: 3000,
			message: "Enter port app is exposing for HTTP/TCP",
			validate: (val) => !Number.isNaN(val) && Number(val) > 0,
		});

		await updateConfig({ namespace, serviceName: name, add: { PORT: String(port) } });
	}

	await ensureServiceForApp(namespace, { name, domains: parsedDomains, port: configMap.PORT });

	console.log();
	log.success("✅ Domain(s) was updated");
	console.log(
		chalk.dim(
			`Any TCP traffic to domain(s) ${parsedDomains.join(", ")} will be routed to the app on port ${
				configMap.PORT
			}`
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

	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

	const confirm = await confirmPrompt(`Are you sure you want to remove domain ${domain}?`);

	if (!confirm) return popScreen();

	const { config } = await getDeploymentAppConfig(deployment);

	const configMap = configRowsToObj(config);

	let updatedDomains = existingDomains.split(",").filter((d) => d !== domain);

	await ensureServiceForApp(namespace, { name, domains: updatedDomains, port: configMap.PORT });

	console.log();
	log.success(`✅ Domain ${domain} was removed`);
	console.log();
	await pressEnterToContinue();
	popScreen();
}

async function makeNonRoutable(deployment: Deployment) {
	lockEsc();

	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

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
	const { name, namespace } = getNameAndNamespaceOrThrow(deployment);

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

const CERT_PLACEHOLDER = `-----BEGIN CERTIFICATE-----
/ * your SSL certificate here */
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
/* any intermediate certificates */
-----END CERTIFICATE-----`;

const KEY_PLACEHOLDER = `-----BEGIN RSA PRIVATE KEY-----
/* your unencrypted private key here */
-----END RSA PRIVATE KEY-----`;

async function addSsl(deployment: Deployment) {
	const { namespace, name } = getNameAndNamespaceOrThrow(deployment);

	let svc = await getService(namespace, name);

	if (!svc) {
		log.error("App has no service/is not routable");
		await pressEnterToContinue();
		popScreen();
		return;
	}

	let existingCerts = parseServiceCertAnnotation(svc);
	const domains = ((svc?.metadata?.annotations || {})[DOMAINS_ANNOTATION] || "").split(",");

	const choices = domains.map((d) => {
		const existingCert = existingCerts.find((ec) => ec.domain === d);
		return {
			message:
				ensureLength(d, 35) + (existingCert ? chalk.green(`SSL enabled 🔐`) : chalk.dim("No SSL/Platform SSL")),
			name: d,
		};
	});

	const { selectedDomain } = await enquirer.prompt<{ selectedDomain: string }>({
		type: "select",
		name: "selectedDomain",
		message: "Select domain for which SSL cert will be configured",
		choices: [separator, ...choices, separator, backChoice],
	});

	if (selectedDomain === "back") {
		popScreen();
		return;
	}

	const selectedDomainHasSsl = !!existingCerts.find((ec) => ec.domain === selectedDomain);

	const { action } = await enquirer.prompt<{ action: string }>({
		type: "select",
		name: "action",
		message: "Select SSL action for domain " + selectedDomain,
		choices: [
			separator,
			{
				message: "Add new SSL cert",
				name: "addNew",
			},
			{
				message: "Copy from other app",
				name: "copy",
			},
			{
				message: chalk.red("Remove SSL cert"),
				name: "remove",
				disabled: !selectedDomainHasSsl,
			},
		],
	});

	if (action === "addNew") {
		let updatedCert = "";
		let updatedKey = "";
		try {
			updatedCert = await openEditor({
				initialContent: CERT_PLACEHOLDER,
				guidance: "",
			});
		} catch (err) {}

		if (!updatedCert || updatedCert === CERT_PLACEHOLDER) {
			log.warn("Nothing was entered, aborting...");
			await sleep(2000);
			return resetScreen();
		}

		try {
			updatedKey = await openEditor({
				initialContent: KEY_PLACEHOLDER,
				guidance: "",
			});
		} catch (err) {}

		if (!updatedKey || updatedKey === KEY_PLACEHOLDER) {
			log.warn("Nothing was entered, aborting...");
			await sleep(2000);
			return resetScreen();
		}

		console.log("Updating...");

		const certSecretName = getCertSecretName(name, selectedDomain);

		//app: wb-file-service
		const secretToCreate = secret(namespace, certSecretName, {
			"tls.crt": updatedCert,
			"tls.key": updatedKey,
		});

		setLabel(secretToCreate, { app: name, domain: selectedDomain });

		await createSecret(namespace, secretToCreate);

		// Refetch to be somewhat sure it is the latest version
		svc = await getService(namespace, name);

		if (!svc) {
			log.error("Failed to get k8s service, please try again");
			await pressEnterToContinue();
			return resetScreen();
		}

		let hasUpdatedCert = false;

		let certStr = parseServiceCertAnnotation(svc)
			.map((ec) => {
				if (ec.domain === selectedDomain) {
					ec.key = name;
					hasUpdatedCert = true;
				}
				return `${ec.domain}:${ec.key}`;
			})
			.join(",");

		if (!hasUpdatedCert) {
			certStr += (certStr ? "," : "") + `${selectedDomain}:${name}`;
		}

		setAnnotation(svc, { [CERT_ANNOTATION]: certStr });

		await updateService(namespace, name, svc);

		log.success(`✅ SSL certificate was attached to domain ${selectedDomain}`);
	} else if (action === "copy") {
		// List certificates

		const allSecrets = await getSecrets(namespace);

		if (!allSecrets) {
			return popScreen();
		}

		const certSecrets = allSecrets.filter(
			(secret) =>
				secret.metadata?.name && secret.metadata.name.includes("-cert") && !!secret.metadata.labels?.fctl
		);

		if (certSecrets.length === 0) {
			console.log();
			console.log("There are no existing certs to copy");
			await pressEnterToContinue();
			return popScreen();
		}

		const { secretName } = await enquirer.prompt<{ secretName: string }>({
			type: "select",
			name: "secretName",
			message: "Select app to copy from ",
			choices: [
				separator,
				...certSecrets.map((secret) => ({
					message: `${secret.metadata?.labels?.app || ""} (${secret.metadata?.labels?.domain || "n/a"})`,
					name: secret.metadata?.name || "",
				})),
			],
		});

		const secretToCopy = certSecrets.find((s) => s.metadata?.name === secretName);

		if (!secretToCopy) {
			throw new Error("Failed to find secret, should not happen");
		}

		const newSecret = secret(
			namespace,
			getCertSecretName(name, selectedDomain),
			{
				"tls.crt": (secretToCopy.data || {})["tls.crt"],
				"tls.key": (secretToCopy.data || {})["tls.key"],
			},
			true
		);

		setLabel(newSecret, { app: name, domain: selectedDomain });

		svc = await getService(namespace, name);

		if (!svc) {
			log.error("Failed to get k8s service, please try again");
			await pressEnterToContinue();
			return resetScreen();
		}

		let certStr = parseServiceCertAnnotation(svc)
			.filter((cert) => cert.domain !== selectedDomain)
			.map((ec) => `${ec.domain}:${ec.key}`)
			.join(",");

		certStr += (certStr ? "," : "") + `${selectedDomain}:${name}`;

		setAnnotation(svc, { [CERT_ANNOTATION]: certStr });

		await updateService(namespace, name, svc);
		await createSecret(namespace, newSecret);
	} else if (action === "remove") {
		svc = await getService(namespace, name);

		if (!svc) {
			log.error("Failed to get k8s service, please try again");
			await pressEnterToContinue();
			return resetScreen();
		}

		const certStr = parseServiceCertAnnotation(svc)
			.filter((cert) => cert.domain !== selectedDomain)
			.map((ec) => `${ec.domain}:${ec.key}`)
			.join(",");

		setAnnotation(svc, { [CERT_ANNOTATION]: certStr });

		await updateService(namespace, name, svc);
		await deleteSecret(namespace, getCertSecretName(name, selectedDomain));

		log.success(`✅ SSL certificate was detached`);
	}

	await pressEnterToContinue();
	popScreen();
}

async function viewLogs(deployment: Deployment) {
	lockEsc();
	const { namespace, name } = getNameAndNamespaceOrThrow(deployment);
	await followLogs(namespace, name);
	popScreen();
}

async function livenessProbe(deployment: Deployment) {
	const { namespace, name } = getNameAndNamespaceOrThrow(deployment);
	const probeStr = getProbeString(deployment, "liveness");

	console.log("Enter liveness probe on format:");
	console.log();
	console.log(`${chalk.dim("exec=")}{command}${chalk.dim(";initialDelaySeconds=")}{sec}`);
	console.log(`${chalk.dim("get=:")}{port}{path}${chalk.dim(";initialDelaySeconds=")}{sec}`);
	console.log(`${chalk.dim("tcp=")}{port}${chalk.dim(";initialDelaySeconds=")}{sec}`);
	console.log();
	// console.log("Éxamples:");
	// console.log();
	// console.log("exec=cat /tmp/health;initialDelaySeconds=60");
	// console.log("get=:8080/healthz;initialDelaySeconds=60");
	// console.log("tcp=8080;initialDelaySeconds=60");

	const { probe } = await enquirer.prompt<{ probe: string }>({
		type: "input",
		name: "probe",
		message: "Set liveness probe",
		initial: probeStr,
	});

	if (probe === probeStr) {
		console.log("No changes");
		await pressEnterToContinue();
		return popScreen();
	}

	const parsedProbe = parseProbeString(probe);

	console.log(JSON.stringify(parsedProbe, null, 2));

	if (await confirmPrompt("Apply changes?", true)) {
		setProbe(probe, deployment, "liveness");
		await updateDeployment(namespace, name, deployment);
		log.success("✅ Probe was updated");
		await pressEnterToContinue();
	}
	popScreen();
}

async function clone(deployment: Deployment) {
	const { namespace, name } = getNameAndNamespaceOrThrow(deployment);

	const { newName } = await enquirer.prompt<{ newName: string }>({
		type: "input",
		name: "newName",
		message: "Enter name of new app",
		initial: name + "-clone",
		validate: (val) => val.trim().length > 0 || "Invalid name",
	});

	try {
		await cloneApp(namespace, name, newName);
	} catch (err) {
		log.error("Failed to clone app");
		console.error(err);
	}

	await pressEnterToContinue();
	popScreen();
}

function parseServiceCertAnnotation(svc: k8s.V1Service) {
	return ((svc?.metadata?.annotations || {})[CERT_ANNOTATION] || "")
		.split(",")
		.filter((row) => !!row)
		.map((row) => {
			const [domain, key] = row.split(":");
			return {
				domain,
				key,
			};
		});
}

function getCertSecretName(appName: string, domain: string) {
	return appName + "-" + domain.replace(/\./g, "-") + "-cert";
}
