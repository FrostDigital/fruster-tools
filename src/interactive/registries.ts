import chalk from "chalk";
import enquirer from "enquirer";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { listRepos } from "../docker/DockerRegistryClient";
import { getSecret, restartPods, updateSecret } from "../kube/kube-client";
import * as log from "../log";
import { Registry } from "../models/Registry";
import {
	base64decode,
	base64encode,
	ensureLength,
	validateAwsAccessKeyIdFormat,
	validateAwsRegionFormat,
	validateAwsSecretAccessKeyFormat,
} from "../utils";
import { formPrompt, pressEnterToContinue, sleep } from "../utils/cli-utils";
import { backChoice, popScreen, pushScreen, resetScreen, separator } from "./engine";

const tokenRefresherSecret = "token-refresher";
const tokenRefresherNamespace = "fruster";
const tokenRefresherAppName = "token-refresher";

export async function registries() {
	const registries = await getDockerRegistries();

	const choices = [
		...registries.map((r) => ({
			name: r.registryHost + "." + r.namespace,
			message: `${ensureLength(r.secretName, 20)} ${ensureLength(r.registryHost, 50)} ${r.namespace}`,
		})),
		separator,
		{ name: "addEcr", message: chalk.green("+ Add AWS ECR registry") },
		// { name: "addDockerHub", message: chalk.green("+ Add private dockerhub") },
		backChoice,
	];

	log.info(`${chalk.magenta(`Found ${registries.length} registries\n`)}`);

	const { registry } = await enquirer.prompt<{ registry: string }>({
		type: "select",
		name: "registry",
		message: `Select registry\n  ${ensureLength("Name", 20)} ${ensureLength("Host", 50)} Namespace`,
		choices,
	});

	if (registry === "back") {
		popScreen();
	} else if (registry === "addEcr") {
		pushScreen({
			escAction: "back",
			render: addEcrRegistry,
		});
	} else {
		pushScreen({
			escAction: "back",
			render: viewRegistry,
			props: {
				registry: registries.find((r) => r.registryHost + "." + r.namespace === registry),
			},
		});
	}
}

async function addEcrRegistry() {
	const tokenRefresher = await getSecret(tokenRefresherSecret, tokenRefresherNamespace);

	if (!tokenRefresher) {
		log.warn(
			`No token refresher config was found, should be named '${tokenRefresherSecret}' and exist in namespace '${tokenRefresherNamespace}'`
		);
		log.info(
			"If you have not already installed the token refresher you can do that in Advanced > Install token refresher"
		);
		await pressEnterToContinue();
		popScreen();
		return;
	}

	log.info(
		"This will add a private ECR registry via Fruster Token Refresher.\n" +
			chalk.dim(
				"Why so? https://medium.com/@xynova/keeping-aws-registry-pull-credentials-fresh-in-kubernetes-2d123f581ca6"
			)
	);

	log.info(
		"\nYou need a AWS access key id and secret access key with permissions to generate docker credentials.\n\n"
	);

	const newRegistry = await formPrompt<{
		name: string;
		namespace: string;
		awsRegistryId: string;
		type: string;
		region: string;
		awsAccessKeyId: string;
		awsSecretAccessKey: string;
	}>({
		message: "Enter registry details",
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
			{
				name: "type",
				message: "Type",
				initial: "ecr",
				validate: (value: string) => (value.length > 0 ? true : "Type is required"),
			},
			{
				name: "awsRegistryId",
				message: "Registry id",
				initial: "1234567890",
				validate: (value: string) => (value.length > 5 ? true : "Invalid registry id"),
			},
			{
				name: "region",
				message: "Region",
				initial: "eu-west-1",
				validate: (value: string) => (validateAwsRegionFormat(value) ? true : "Invalid aws region"),
			},
			{
				name: "awsAccessKeyId",
				message: "AWS Access Key Id",
				initial: "*************",
				validate: (value: string) => (validateAwsAccessKeyIdFormat(value) ? true : "Invalid format"),
			},
			{
				name: "awsSecretAccessKey",
				message: "AWS Secret Access Key",
				initial: "********************",
				validate: (value: string) => (validateAwsSecretAccessKeyFormat(value) ? true : "Invalid format"),
			},
		],
	});

	const existingRegistries: any[] = JSON.parse(base64decode(tokenRefresher!.data.REGISTRIES));

	const alreadyExistingReg = existingRegistries.find(
		(r) => r.name === newRegistry.name && r.namespace === newRegistry.namespace
	);

	if (alreadyExistingReg) {
		console.log();
		console.log(`Config already exists ${newRegistry.namespace}.${newRegistry.name}:`);
		console.log(alreadyExistingReg);
		console.log();

		const answer = await enquirer.prompt<{ confirm: boolean }>({
			type: "confirm",
			name: "confirm",
			message: "Do you want to overwrite it?",
		});

		if (answer.confirm) {
			const updateRegistries = [
				...existingRegistries.filter(
					(r) => r.name !== newRegistry.name && r.namespace !== newRegistry.namespace
				),
				newRegistry,
			];

			await updateSecret(tokenRefresherNamespace, tokenRefresherSecret, {
				...tokenRefresher,
				data: { REGISTRIES: base64encode(JSON.stringify(updateRegistries)) },
			});

			log.success("✅ Configuration was updated");
			await restartTokenRefresher();
			await pressEnterToContinue();
			popScreen();
		} else {
			resetScreen();
		}
	} else {
		await updateSecret(tokenRefresherNamespace, tokenRefresherSecret, {
			...tokenRefresher,
			data: { REGISTRIES: base64encode(JSON.stringify([...existingRegistries, newRegistry])) },
		});

		console.log();
		log.success("✅ Registry was added");
		await restartTokenRefresher();
		await pressEnterToContinue();
		popScreen();
	}
}

async function restartTokenRefresher() {
	console.log();
	console.log("Restarting token refresher pod...");
	await restartPods(tokenRefresherNamespace, tokenRefresherAppName, false);
	await sleep(2000); // add some extra time so token refresher had time to refresh, just in case...
	console.log("Done");
}

async function viewRegistry({ registry }: { registry: Registry }) {
	// TODO: Not sure what we want to do here, for now just list all repos

	// List all repos in a private docker registry
	const repos = (await listRepos(registry.dockerAuthToken, registry.registryHost)).map((r) => ({
		message: r,
		name: r,
	}));

	console.log(chalk.magenta(`Selected ${registry.registryHost}`));
	console.log();
	console.log(`Found ${repos.length} repos:`);
	console.log();
	for (const r of repos) {
		console.log(r.name);
	}

	await pressEnterToContinue();
	popScreen();
}
