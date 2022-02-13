import enquirer from "enquirer";
import { createFrusterNamespace } from "../actions/create-fruster-namespace";
import { getDockerRegistries } from "../actions/get-docker-registries";
import * as dockerHubClient from "../docker/DockerHubClient";
import * as dockerRegistryClient from "../docker/DockerRegistryClient";
import {
	createAppDeployment,
	createNamespace,
	ensureServiceForApp,
	getConfigMap,
	getPods,
	getSecret,
	setConfig,
} from "../kube/kube-client";
import { GLOBAL_CONFIG_NAME, GLOBAL_SECRETS_NAME } from "../kube/kube-templates";
import * as log from "../log";
import { Registry } from "../models/Registry";
import { ensureLength } from "../utils";
import { getUsername, pressEnterToContinue, sleep } from "../utils/cli-utils";
import { parseStringConfigToObj, prettyPrintPods } from "../utils/string-utils";
import { popScreen } from "./engine";

export async function createApp() {
	const user = await getUsername();

	console.log();
	console.log("This wizard will create an app and deploy it to cluster.");
	console.log();

	const registries = await getDockerRegistries();

	const { registry, repo, tag } = await selectImage(registries);

	const { name, namespace, routable } = await enquirer.prompt<{
		name: string;
		namespace: string;
		routable: boolean;
	}>([
		{
			type: "input",
			name: "name",
			message: "Enter name of app",
			initial: repo,
		},
		{
			type: "input",
			name: "namespace",
			message: "Enter namespace",
		},
		{
			type: "confirm",
			name: "routable",
			initial: false,
			message: "Is app routable?",
		},
	]);

	// NOTE: Split into two prompts as skip based on routable does not seems to be dynamic
	const { port, domains, healthCheckType, config } = await enquirer.prompt<{
		port?: number;
		domains?: string;
		healthCheckType: string;
		config: string;
	}>([
		{
			type: "input",
			name: "domains",
			message: "Which domain(s) should be routed to this service? Enter CSV list if multiple.",
			initial: name,
			skip: !routable,
		},
		{
			type: "numeral",
			name: "port",
			message: "Enter port",
			skip: !routable,
		},
		{
			type: "input",
			name: "config",
			message: `Enter config for, separate with space (example FOO=val BAR=val)`,
		},
		{
			type: "select",
			name: "healthCheckType",
			message: "Select type of liveness check",
			choices: ["fruster-health", "None"],
		},
	]);

	const parsedConfig = parseStringConfigToObj(config);

	if (!parsedConfig.PORT && port) {
		parsedConfig.PORT = port;
	}

	// Ensure namespace (it will not be created if already existing)
	await createFrusterNamespace(namespace);

	// Create config
	const appConfigSecret = await setConfig(namespace, name, parsedConfig);

	await createAppDeployment(
		namespace,
		{
			domains: domains ? domains.split(",").map((d) => d.trim()) : undefined,
			name,
			image: registry.registryHost ? [registry.registryHost, repo].join("/") : repo,
			imageTag: tag,
			imagePullSecret: registry.secretName,
			env: parsedConfig,
			livenessHealthCheck: healthCheckType === "fruster-health" ? "fruster-health" : undefined,
		},
		{
			changeCause: user + " created app using fruster cli",
			hasGlobalConfig: true,
			hasGlobalSecrets: true,
			configName: appConfigSecret.metadata.name,
		}
	);

	if (routable) {
		log.info("Service is routable, making sure that service exists...");

		const trimmedDomains = Array.from(new Set((domains as string).split(",").map((d) => d.trim())));
		const created = await ensureServiceForApp(namespace, {
			name,
			domains: trimmedDomains,
			port: parsedConfig.PORT,
		});
		log.success(`Service ${created ? "was created" : "already exists"}`);
	}

	log.success("\nDeployment instructions was successfully delivered to k8s\n");

	await sleep(2500);

	const pods = await getPods(namespace, name);

	prettyPrintPods(pods);

	await pressEnterToContinue();

	popScreen();
}

async function selectImage(registries: Registry[]) {
	const choices = [
		...registries.map((r) => ({
			name: r.registryHost,
			message: `${ensureLength(r.registryHost, 50)} ${ensureLength(r.secretName, 20)} ${r.namespace}`,
		})),
		{
			message: `${ensureLength("hub.docker.com", 50)} fruster (public)`,
			name: "fruster-public",
		},
	];

	const { registry } = await enquirer.prompt<{ registry: string }>({
		type: "select",
		name: "registry",
		message: `Select registry where container is hosted`,
		choices,
	});

	let repoChoices = [];

	const isFrusterDockerHub = registry === "fruster-public";
	const selectedRegistryAuth = isFrusterDockerHub ? undefined : registries.find((r) => r.registryHost === registry);

	if (isFrusterDockerHub) {
		// List all repos in fruster public repo
		repoChoices = await (
			await dockerHubClient.listRepos("fruster")
		).map((r) => ({
			message: r,
			name: r,
		}));
	} else {
		// List all repos in a private docker registry
		repoChoices = (
			await dockerRegistryClient.listRepos(
				selectedRegistryAuth?.dockerAuthToken as string,
				selectedRegistryAuth?.registryHost as string
			)
		).map((r) => ({
			message: r,
			name: r,
		}));
	}

	const { repo } = await enquirer.prompt<{ repo: string }>({
		type: "select",
		name: "repo",
		message: "Select repo:",
		choices: repoChoices.sort((a, b) => a.name.localeCompare(b.name)),
	});

	let tagChoices = [];

	if (isFrusterDockerHub) {
		tagChoices = await (
			await dockerHubClient.listTags("fruster", repo)
		).map((t) => ({
			message: t,
			name: t,
		}));
	} else {
		tagChoices = (
			await dockerRegistryClient.listTags(selectedRegistryAuth?.dockerAuthToken as string, registry, repo)
		).map((t) => ({
			message: t,
			name: t,
		}));
	}

	const { tag } = await enquirer.prompt<{ tag: string }>({
		type: "select",
		name: "tag",
		message: "Select tag:",
		choices: tagChoices,
	});

	return {
		repo,
		registry: isFrusterDockerHub
			? { registryHost: "fruster", dockerAuthToken: "", secretName: "", namespace: "" }
			: registries.find((r) => r.registryHost === registry)!,
		tag,
	};
}
