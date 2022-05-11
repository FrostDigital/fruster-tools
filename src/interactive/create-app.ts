import chalk from "chalk";
import enquirer from "enquirer";
import { createFctlNamespace } from "../actions/create-fctl-namespace";
import { getDockerRegistries } from "../actions/get-docker-registries";
import * as dockerHubClient from "../docker/DockerHubClient";
import * as dockerRegistryClient from "../docker/DockerRegistryClient";
import { createAppDeployment, ensureServiceForApp, getPods } from "../kube/kube-client";
import * as log from "../log";
import { Registry } from "../models/Registry";
import { ensureLength } from "../utils";
import { getUsername, pressEnterToContinue, sleep } from "../utils/cli-utils";
import { parseStringConfigToObj, prettyPrintPods } from "../utils/string-utils";
import { popScreen, resetScreen } from "./engine";

export async function createApp() {
	const user = await getUsername();

	console.log();
	console.log("This wizard will create an app and deploy it to cluster.");
	console.log();

	const registries = await getDockerRegistries();

	const res = await selectImage(registries);

	if (!res) {
		return resetScreen();
	}

	const { registry, repo, tag } = res;

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
	await createFctlNamespace(namespace);

	await createAppDeployment(
		namespace,
		{
			domains: domains ? domains.split(",").map((d) => d.trim()) : undefined,
			name,
			image: registry.registryHost !== "dockerhub" ? [registry.registryHost, repo].join("/") : repo,
			imageTag: tag,
			imagePullSecret: registry.secretName,
			env: parsedConfig,
			livenessHealthCheck: healthCheckType === "fruster-health" ? "fruster-health" : undefined,
		},
		{
			changeCause: user + " created app using fctl",
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
			message: `${ensureLength("hub.docker.com", 50)} docker hub (public)`,
			name: "dockerhub",
		},
	];

	const { registry } = await enquirer.prompt<{ registry: string }>({
		type: "select",
		name: "registry",
		message: `Select registry where container is hosted`,
		choices,
	});

	let repoChoices = [];

	const isDockerHub = registry === "dockerhub";
	const selectedRegistryAuth = isDockerHub ? undefined : registries.find((r) => r.registryHost === registry);

	let dockerHubImage = "";
	let repo = "";

	if (isDockerHub) {
		const res = await enquirer.prompt<{ dockerHubImage: string }>({
			name: "dockerHubImage",
			message: "Enter docker image (including organisation, if any)",
			initial: "org/repo",
			type: "input",
		});

		dockerHubImage = res.dockerHubImage;
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

		const res = await enquirer.prompt<{ repo: string }>({
			type: "select",
			name: "repo",
			message: "Select repo:",
			choices: repoChoices.sort((a, b) => a.name.localeCompare(b.name)),
		});

		repo = res.repo;
	}

	let tagChoices = [];

	if (isDockerHub) {
		const [orgOrRepo, repo] = dockerHubImage.split("/");
		tagChoices = await (
			await dockerHubClient.listTags({ org: repo ? orgOrRepo : undefined, repo: repo ?? orgOrRepo })
		).map((t) => ({
			message: `${ensureLength(t.name, 30)} ${chalk.dim(t.lastUpdated)}`,
			name: t.name,
		}));
	} else {
		tagChoices = (
			await dockerRegistryClient.listTags(selectedRegistryAuth?.dockerAuthToken as string, registry, repo)
		).map((t) => ({
			message: t,
			name: t,
		}));
	}

	if (tagChoices.length === 0) {
		console.log("No tags found");
		await pressEnterToContinue();
		return resetScreen();
	}

	const { tag } = await enquirer.prompt<{ tag: string }>({
		type: "select",
		name: "tag",
		message: "Select tag:",
		choices: tagChoices,
	});

	return {
		repo,
		registry: isDockerHub
			? { registryHost: "dockerhub", dockerAuthToken: "", secretName: "", namespace: "" }
			: registries.find((r) => r.registryHost === registry)!,
		tag,
	};
}
