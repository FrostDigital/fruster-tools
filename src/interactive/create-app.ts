import chalk from "chalk";
import enquirer from "enquirer";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { ensureLength } from "../utils";
import { formPrompt, pressEnterToContinue } from "../utils/cli-utils";
import { backChoice, popScreen, separator } from "./engine";
import * as log from "../log";
import * as dockerHubClient from "../docker/DockerHubClient";
import * as dockerRegistryClient from "../docker/DockerRegistryClient";
import { Registry } from "../models/Registry";

// inquirer.registerPrompt("autocomplete", inquirerAutocompletePrompt);

export async function createApp() {
	console.log();
	console.log("This wizard will create an app and deploy it to cluster.");
	console.log();
	console.log(chalk.magenta("Select the docker registry where container you want to deploy is located."));
	console.log();

	const registries = await getDockerRegistries();

	await selectImage(registries);

	const newApp = await formPrompt<{
		name: string;
		namespace: string;
	}>({
		message: "Enter app details",
		choices: [
			{
				name: "name",
				message: "Name",
				initial: "my-registry",
				validate: (value: string) => (value.length > 0 ? true : "Name is required"),
			},
			{
				name: "namespace",
				message: "Namespace",
				validate: (value: string) => (value.length > 0 ? true : "Namespace is required"),
			},
		],
	});
}

async function selectImage(registries: Registry[]) {
	const choices = [
		...registries.map((r) => ({
			name: r.registryHost,
			// value: r.registryHost,
			message: `${ensureLength(r.secretName, 20)} ${ensureLength(r.registryHost, 50)} ${r.namespace}`,
		})),
		{
			message: `${ensureLength("fruster (public)", 20)} ${ensureLength("hub.docker.com", 50)} n/a`,
			name: "fruster-public",
		},
	];

	const { registry } = await enquirer.prompt<{ registry: string }>({
		type: "select",
		name: "registry",
		message: `Select registry\n  ${ensureLength("Name", 20)} ${ensureLength("Host", 50)} Namespace`,
		choices,
	});

	let repoChoices = [];

	const isDockerHub = registry === "fruster-public";
	const selectedRegistryAuth = isDockerHub ? undefined : registries.find((r) => r.registryHost === registry);

	// console.log(selectedRegistryAuth?.dockerAuthToken, selectedRegistryAuth?.registryHost);

	if (isDockerHub) {
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

	if (isDockerHub) {
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
		name: "newTag",
		message: "Select tag:",
		choices: tagChoices,
	});

	return {
		repo,
		registry,
		tag,
	};
}

// 	async function createSingleAppWizard() {
// 		const { confirm } = await inquirer.prompt([
// 			{
// 				type: "confirm",
// 				name: "confirm",
// 				default: true,
// 				message: `This will create a new app/deployment '${app}' in namespace '${namespace}', do you want to continue?`,
// 			},
// 		]);

// 		if (!confirm) {
// 			process.exit(0);
// 		}

// 		const registries = await getDockerRegistries(namespace);

// 		let registryUrl: string;

// 		let fetchedRepos: string[];

// 		const { publicImage, routable, domains, healthCheckType, config, repo, tag, registry } = await inquirer.prompt<{
// 			publicImage?: string;
// 			routable: boolean;
// 			domains: string;
// 			healthCheckType: string;
// 			config: string;
// 			registry: string;
// 			tag?: string;
// 			repo?: string;
// 		}>([
// 			{
// 				type: "list",
// 				name: "registry",
// 				message: "Choose docker registry",
// 				choices: [FRUSTER_PUBLIC_OPTION, ...registries.map((r) => r.registryHost), "Other"],
// 			},
// 			{
// 				type: "input",
// 				name: "publicImage",
// 				when: (answers) => answers.registry === "Other",
// 				message: `Enter image to deploy including tag`,
// 				validate: (input: string) => {
// 					if (input.indexOf(":") === -1) {
// 						return "Tag must be entered, for example 'fruster/fruster-api-gateway:latest'";
// 					}
// 					return true;
// 				},
// 			},
// 			{
// 				type: "autocomplete",
// 				name: "repo",
// 				when: (answers) => answers.registry !== "Other",
// 				message: (answers) => `Choose repo from ${answers.registry}`,
// 				source: async (answers: any, input: string) => {
// 					if (!fetchedRepos) {
// 						registryUrl =
// 							answers.registry === FRUSTER_PUBLIC_OPTION
// 								? "https://hub.docker.com"
// 								: "https://" + answers.registry;
// 						if (answers.registry === FRUSTER_PUBLIC_OPTION) {
// 							fetchedRepos = await dockerHubClient.listRepos("fruster");
// 						} else {
// 							const selectedRegistryAuth = registries.find((r) => r.registryHost === answers.registry);
// 							fetchedRepos = await dockerRegistryClient.listRepos(
// 								selectedRegistryAuth?.dockerAuthToken as string,
// 								registryUrl
// 							);
// 						}
// 					}

// 					return (input || "").trim() ? fetchedRepos.filter((r) => r.includes(input.trim())) : fetchedRepos;
// 				},
// 			},
// 			{
// 				type: "list",
// 				name: "tag",
// 				when: (answers) => answers.registry !== "Any public registry",
// 				message: (answers) => `Choose tag from ${answers.repo}`,
// 				choices: async (answers) => {
// 					if (answers.registry === FRUSTER_PUBLIC_OPTION) {
// 						return dockerHubClient.listTags("fruster", answers.repo as string);
// 					} else {
// 						const selectedRegistryAuth = registries.find((r) => r.registryHost === answers.registry);
// 						return await dockerRegistryClient.listTags(
// 							selectedRegistryAuth?.dockerAuthToken as string,
// 							registryUrl,
// 							answers.repo as string
// 						);
// 					}
// 				},
// 			},

// 			{
// 				type: "confirm",
// 				name: "routable",
// 				default: false,
// 				message: "Is app routable?",
// 				suffix: "\nEnter Yes if HTTP traffic should be routed directly to service",
// 			},
// 			{
// 				type: "input",
// 				name: "domains",
// 				when: (answers) => answers.routable,
// 				message: "Which domain(s) should be routed to this service? Enter CSV list if multiple.",
// 				suffix: `\nService will always by default listen on '${app}.{router domain}'`,
// 				validate: (input: string) => {
// 					if (input) {
// 						const split = input.split(",");

// 						for (const d of split) {
// 							if (d.indexOf(".") === -1 || d.indexOf("*")) {
// 								return `'${d}' is not a valid domain`;
// 							}
// 						}
// 					}

// 					return true;
// 				},
// 			},
// 			{
// 				type: "input",
// 				name: "config",
// 				message: (answers) =>
// 					`Enter env config for example FOO=val BAR=val${
// 						answers.routable ? " (routable apps requires PORT)" : ""
// 					}`,
// 			},
// 			{
// 				type: "list",
// 				name: "healthCheckType",
// 				message: "Select type of liveness check",
// 				choices: ["fruster-health", "None"],
// 			},
// 		]);

// 		// Upsert namespace
// 		await createNamespace(namespace, false);

// 		// TODO: Resource limits

// 		let imageToDeploy: string;
// 		let tagToDeploy: string;

// 		if (publicImage) {
// 			const [repoPart, tagPart] = publicImage.split(":");
// 			imageToDeploy = repoPart;
// 			tagToDeploy = tagPart;
// 		} else if (registry === FRUSTER_PUBLIC_OPTION && tag) {
// 			imageToDeploy = "fruster/" + repo;
// 			tagToDeploy = tag;
// 		} else if (repo && tag) {
// 			imageToDeploy = registry + "/" + repo;
// 			tagToDeploy = tag;
// 		} else {
// 			log.error("Missing repo and/or tag");
// 			process.exit(1);
// 		}

// 		const parsedConfig = parseStringConfigToObj(config);

// 		const selectedRegistry = registries.find((r) => r.registryHost === registry);

// 		// Create config
// 		await setConfig(namespace, app, parsedConfig);

// 		// Upsert deployment based on configuration from service registry
// 		await createAppDeployment(
// 			namespace,
// 			{
// 				domains: domains ? domains.split(",").map((d) => d.trim()) : undefined,
// 				name: app,
// 				image: imageToDeploy,
// 				imageTag: tagToDeploy,
// 				imagePullSecret: selectedRegistry?.secretName,
// 				env: parsedConfig,
// 				livenessHealthCheck: healthCheckType === "fruster-health" ? "fruster-health" : undefined,
// 			},
// 			username + " created app using fruster cli"
// 		);

// 		if (routable) {
// 			log.info("Service is routable, making sure that service exists...");

// 			const trimmedDomains = (domains as string).split(",").map((d) => d.trim());
// 			const created = await createService(namespace, { name: app, domains: trimmedDomains, env: parsedConfig });
// 			log.success(`Service ${created ? "was created" : "already exists"}`);
// 		}

// 		log.success("\nDeployment instructions was successfully delivered to k8s\n");

// 		await wait(2500);

// 		const pods = await getPods(namespace, app);

// 		prettyPrintPods(pods);
// 	}
// }

// run();

// async function wait(ms: number) {
// 	return new Promise((resolve) => setTimeout(resolve, ms));
// }
