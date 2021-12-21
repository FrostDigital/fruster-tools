#!/usr/bin/env node

import { program } from "commander";
import inquirer from "inquirer";
import { listRepos, listTags } from "../docker/DockerRegistryClient";
import {
	createDeployment,
	createNamespace,
	createService,
	getDeployment,
	getPods,
	getSecrets,
	setConfig,
} from "../kube/kube-client";
import * as log from "../log";
import { create } from "../service-registry";
import { parseStringConfigToObj } from "../utils";
const { getUsername } = require("../utils/cli-utils");

program
	.description(
		`
Creates kubernetes deployments for services that are defined service registry or create a single
deployment for a single service thru an interactive wizard.

Namespace will be created if it does not already exists.

Examples:

# Creates deployments for services that are defined in service registry json file
$ fruster create -s services.json -n my-namespace

# Creates a kube deployment for single service, will start an interactive shell
$ fruster create -a my-app -n my-namespace
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run, only applicable in non interactive mode")
	.requiredOption("-n, --namespace <namespace>", "kubernetes namespace that service(s) should be created in")
	.option("-s, --service-registry <file>", "service registry json file")
	.option("-a, --app <app>", "name of app (a.k.a. service)")
	.parse(process.argv);

const dryRun = !program.opts().yes;
const serviceRegPath = program.opts().serviceRegistry;
const namespace = program.opts().namespace;
const app = program.opts().app;

async function run() {
	if (!app && !serviceRegPath) {
		log.error(
			`\nEither --service-registry or --app must be set\n\nExamples:\n$ fruster create -a my-app -n my-namespace\n$ fruster create --service-registry services.json -n my-namespace`
		);
		process.exit(1);
	}

	const username = await getUsername();

	if (app) {
		await createSingleAppWizard();
	} else {
		await createAppsFromServiceRegistry();
	}

	async function createAppsFromServiceRegistry() {
		const serviceRegistry = await create(serviceRegPath);

		const apps = serviceRegistry.getServices("*");

		if (!apps.length) {
			log.error("Could not find configuration for services, is service registry empty?");
			return process.exit(1);
		}

		for (const appConfig of apps) {
			if (!appConfig.image) {
				log.warn("No 'image' set for service " + appConfig.name);
				continue;
			}
			// Upsert namespace
			await createNamespace(namespace, dryRun);

			if (!dryRun) {
				// Upsert config (saved as secets)
				await setConfig(namespace, appConfig.name, appConfig.env);
			} else {
				log.info(`[Dry run] Skipping set config ${appConfig.name} ${JSON.stringify(appConfig.env)}`);
			}

			if (!dryRun) {
				// Upsert deployment based on configuration from service registry
				await createDeployment(namespace, appConfig, username + " created app");
			} else {
				log.info(`[Dry run] Skipping create deployment`);
			}

			log.success("Created deployment");

			if (appConfig.routable) {
				log.info("Service is routable, making sure that service exists...");

				if (!dryRun) {
					const created = await createService(namespace, appConfig);
					log.success(`Service ${created ? "was created" : "already exists"}`);
				} else {
					log.info(`[Dry run] Skipping make routable`);
				}
			}
		}
	}

	async function createSingleAppWizard() {
		const { confirm } = await inquirer.prompt([
			{
				type: "confirm",
				name: "confirm",
				default: true,
				message: `This will create a new app/deployment '${app}' in namespace '${namespace}', do you want to continue?`,
			},
		]);

		if (!confirm) {
			process.exit(0);
		}

		const registries = await getDockerRegistries(namespace);

		const { publicImage, routable, domains, healthCheckType, config, repo, tag, registry } = await inquirer.prompt<{
			publicImage?: string;
			routable: boolean;
			domains: string;
			healthCheckType: string;
			config: string;
			registry: string;
			tag?: string;
			repo?: string;
		}>([
			{
				type: "list",
				name: "registry",
				message: "Choose docker registry",
				choices: ["Any public registry", ...registries.map((r) => r.registryHost)],
			},
			{
				type: "input",
				name: "publicImage",
				when: (answers) => answers.registry === "Any public registry",
				message: `Enter image to deploy including tag`,
				validate: (input: string) => {
					if (input.indexOf(":") === -1) {
						return "Tag must be entered, for example 'fruster/fruster-api-gateway:latest'";
					}
					return true;
				},
			},
			{
				type: "list",
				name: "repo",
				when: (answers) => answers.registry !== "Any public registry",
				message: (answers) => `Choose repo from ${answers.registry}`,
				choices: async (answers) => {
					const selectedRegistryAuth = registries.find((r) => r.registryHost === answers.registry);
					const repos = await listRepos(
						selectedRegistryAuth?.dockerAuthToken as string,
						"https://" + answers.registry
					);
					return repos;
				},
			},
			{
				type: "list",
				name: "tag",
				when: (answers) => answers.registry !== "Any public registry",
				message: (answers) => `Choose tag from ${answers.repo}`,
				choices: async (answers) => {
					const selectedRegistryAuth = registries.find((r) => r.registryHost === answers.registry);
					const tags = await listTags(
						selectedRegistryAuth?.dockerAuthToken as string,
						"https://" + answers.registry,
						answers.repo as string
					);
					return tags;
				},
			},
			{
				type: "input",
				name: "config",
				message: `Enter env config (example FOO=val BAR=val)`,
			},
			{
				type: "confirm",
				name: "routable",
				default: false,
				message: "Is app routable?",
				suffix: "\nEnter Yes if HTTP traffic should be routed directly to service",
			},
			{
				type: "input",
				name: "domains",
				when: (answers) => answers.routable,
				message: "Which domain(s) should be routed to this service? Enter CSV list if multiple.",
				suffix: `\nService will always by default listen on '${app}.{router domain}'`,
				validate: (input: string) => {
					if (input) {
						const split = input.split(",");

						for (const d of split) {
							if (d.indexOf(".") === -1 || d.indexOf("*")) {
								return `'${d}' is not a valid domain`;
							}
						}
					}

					return true;
				},
			},
			{
				type: "list",
				name: "healthCheckType",
				message: "Select type of liveness check",
				choices: ["fruster-health", "None"],
			},
		]);

		// Upsert namespace
		await createNamespace(namespace, false);

		// TODO: Resource limits

		let imageToDeploy: string;
		let tagToDeploy: string;

		if (publicImage) {
			const [repoPart, tagPart] = publicImage.split(":");
			imageToDeploy = repoPart;
			tagToDeploy = tagPart;
		} else if (repo && tag) {
			imageToDeploy = registry + "/" + repo;
			tagToDeploy = tag;
		} else {
			log.error("Missing repo and/or tag");
			process.exit(1);
		}

		const parsedConfig = parseStringConfigToObj(config);

		const selectedRegistry = registries.find((r) => r.registryHost === registry);

		// Create config
		await setConfig(namespace, app, parsedConfig);

		// Upsert deployment based on configuration from service registry
		await createDeployment(
			namespace,
			{
				domains: domains ? domains.split(",").map((d) => d.trim()) : undefined,
				name: app,
				image: imageToDeploy,
				imageTag: tagToDeploy,
				imagePullSecret: selectedRegistry?.secretName,
				env: parsedConfig,
				livenessHealthCheck: healthCheckType === "fruster-health" ? "fruster-health" : undefined,
			},
			username + " created app using fruster cli"
		);

		if (routable) {
			log.info("Service is routable, making sure that service exists...");

			const trimmedDomains = (domains as string).split(",").map((d) => d.trim());
			const created = await createService(namespace, { name: app, domains: trimmedDomains, env: {} });
			log.success(`Service ${created ? "was created" : "already exists"}`);
		}

		log.success("Deployment instructions was successfully delivered to k8s");

		await wait(2500);

		const pods = await getPods(namespace, app);

		for (const pod of pods) {
			const [lastContainerStatus] = pod.status.containerStatuses;
			log.info(`Pod ${pod.metadata.name} status: ${JSON.stringify(lastContainerStatus)}`);
		}
	}
}

run();

/**
 * Finds alls docker registries that are configured with a auth token
 * withing the cluster.
 *
 * The secret is a base64 encoded auth JSON object needed to access docker registries.
 *
 * @param namespace
 * @returns
 */
async function getDockerRegistries(
	namespace: string
): Promise<{ registryHost: string; dockerAuthToken: string; secretName: string }[]> {
	const res = await getSecrets(namespace);

	return (res || [])
		.filter((r) => r.type === "kubernetes.io/dockerconfigjson")
		.map((r) => {
			const dockerAuth = JSON.parse(Buffer.from(r.data[".dockerconfigjson"], "base64").toString("ascii"));
			return {
				dockerAuthToken: dockerAuth.auths[Object.keys(dockerAuth.auths)[0]].auth,
				secretName: r.metadata.name,
				registryHost: Object.keys(dockerAuth.auths)[0],
			};
		});
}

async function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
