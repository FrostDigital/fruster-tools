import chalk from "chalk";
import deepEqual from "deep-equal";
import enquirer from "enquirer";
import { terminal } from "terminal-kit";
import { createFrusterNamespace } from "../actions/create-fruster-namespace";
import {
	createConfigMap,
	createSecret,
	deleteNamespace as deleteKubeNamespace,
	getConfigMap,
	getNamespaces,
	getSecret,
	updateConfigMap,
	updateSecret,
} from "../kube/kube-client";
import { configMap, GLOBAL_CONFIG_NAME, GLOBAL_SECRETS_NAME, secret } from "../kube/kube-templates";
import * as log from "../log";
import { ConfigMap } from "../models/ConfigMap";
import { Namespace } from "../models/Namespace";
import { Secret } from "../models/Secret";
import { base64decode, base64encode, ensureLength, maskStr } from "../utils";
import {
	clearScreen,
	confirmPrompt,
	editConfigInEditor,
	EDIT_GLOBAL_CONFIG_WARNING,
	EDIT_GLOBAL_SECRECTS_WARNING,
	isMasked,
	maskConfig,
	pressEnterToContinue,
	printConfigChanges,
	printTable,
	sleep,
} from "../utils/cli-utils";
import { backChoice, popScreen, pushScreen, resetScreen, separator } from "./engine";

export async function namespaces() {
	console.log("Loadings namespaces...");

	const allNamespaces = await getNamespaces();

	const namespaces = allNamespaces.filter((ns) => ns.metadata?.labels?.fctl);

	clearScreen();

	const namespaceChoices = namespaces.map((ns) => ({
		message: `${ns.metadata?.name}${ns.status?.phase === "Terminating" ? " 💥 Terminating" : ""}`,
		name: ns.metadata!.name!,
	}));

	log.info(
		`${chalk.magenta(`Found ${namespaceChoices.length} namespace(s)`)}\nSelect with arrow keys and press enter`
	);

	console.log(chalk.dim("Only fruster namespaces will show (those labeled 'fctl=true')"));
	console.log();

	const { ns } = await enquirer.prompt<{ ns: any }>([
		{
			type: "select",
			name: "ns",
			message: "Select namespace",
			choices: [
				...namespaceChoices,
				separator,
				{ message: chalk.green("+ Create namespace"), name: "createNamespace" },
				backChoice,
			],
		},
	]);

	if (ns === "back") {
		popScreen();
	} else if (ns === "createNamespace") {
		pushScreen({
			render: createNamespace,
			escAction: "back",
			props: allNamespaces,
		});
	} else if (ns) {
		pushScreen({
			props: namespaces.find((namespace) => namespace.metadata?.name === ns),
			render: viewNamespace,
			escAction: "back",
		});
	}
}

async function createNamespace(existingNamespaces: Namespace[]) {
	const { name } = await enquirer.prompt<{ name: string }>({
		type: "input",
		name: "name",
		message: `Enter name of namespace:`,
		validate: (val) => val.length > 0,
	});

	const trimmedName = name.trim();

	if (existingNamespaces.find((ns) => ns.metadata.name === trimmedName)) {
		console.log(`Namespace with name ${trimmedName} already exists`);
		await pressEnterToContinue();
		return resetScreen();
	}

	if (await confirmPrompt(`Are you sure you want to create namespace '${trimmedName}'?`, true)) {
		await createFrusterNamespace(trimmedName);
		console.log();
		log.success("Namespace was created");
		console.log();
		await pressEnterToContinue();
	}

	popScreen();
}

async function viewNamespace(ns: Namespace) {
	const { name } = ns.metadata;

	clearScreen();

	terminal.defaultColor("> Selected namespace ").green(name + "\n\n");

	const { action } = await enquirer.prompt<{ action: string }>({
		type: "select",
		name: "action",
		message: "Namespace menu",
		choices: [
			separator,
			{
				message: `${ensureLength("Config", 20)}${chalk.dim(
					"Global env available for all apps within namespace"
				)}`,
				name: "globalConfig",
			},
			{
				message: `${ensureLength("Secrets", 20)}${chalk.dim(
					"Global secrets available for all apps within namespace"
				)}`,
				name: "globalSecrets",
			},
			{
				message: chalk.red("Delete namespace"),
				name: "delete",
			},
			separator,
			backChoice,
		],
	});

	switch (action) {
		case "globalConfig":
			pushScreen({
				render: globalConfig,
				props: ns,
				escAction: "back",
			});
			break;
		case "globalSecrets":
			pushScreen({
				render: globalSecrets,
				props: { namespace: ns },
				escAction: "back",
			});
			break;

		case "delete":
			deleteNamespace(ns);
			break;
		default:
			popScreen();
			break;
	}
}

async function globalConfig(ns: Namespace) {
	const globalConfig = await getConfigMap(ns.metadata.name, GLOBAL_CONFIG_NAME);

	console.log("Global config are config exposed as env vars to all apps within the namespace");
	console.log();

	const tableRows = Object.keys(globalConfig?.data || {}).map((k) => [k, (globalConfig?.data || {})[k]]);

	printTable(tableRows, ["Key", "Value"], true);

	const { action } = await enquirer.prompt<{ action: string }>({
		type: "select",
		name: "action",
		message: "Global config",
		choices: [
			separator,
			{
				message: chalk.magenta(`o Edit config`),
				name: "edit",
			},
			backChoice,
		],
	});

	if (action === "edit") {
		pushScreen({
			render: editConfigMap,
			escAction: "back",
			props: { namespace: ns, configMap: globalConfig },
		});
	} else {
		popScreen();
	}
}

async function globalSecrets({ namespace, reveal }: { namespace: Namespace; reveal?: boolean }) {
	const globalSecret = await getSecret(namespace.metadata.name, GLOBAL_SECRETS_NAME);

	const configKeys = Object.keys(globalSecret?.data || {});

	console.log();

	if (configKeys.length === 0) {
		console.log();
		console.log("Namespace has no global secrets");
		console.log();
	} else {
		const tableRows = configKeys.map((k) => [
			chalk.dim(k),
			reveal ? base64decode((globalSecret?.data || {})[k]) : maskStr((globalSecret?.data || {})[k]),
		]);

		printTable(tableRows, ["Key", "Value"], true);
	}

	const { keyOrAction } = await enquirer.prompt<{ keyOrAction: string }>([
		{
			type: "select",
			name: "keyOrAction",
			message: "Select action",
			choices: [
				separator,
				{
					message: "o Edit secrets",
					name: "edit",
				},
				{
					message: reveal ? "⚉ Hide secrets" : "⚇ Reveal secrets",
					name: "reveal",
				},
				separator,
				backChoice,
			],
		},
	]);

	if (keyOrAction === "back") {
		popScreen();
	} else if (keyOrAction === "edit") {
		pushScreen({
			render: editSecrets,
			props: { namespace: namespace, secret: globalSecret },
			escAction: "back",
		});
	} else if (keyOrAction === "reveal") {
		resetScreen({
			reveal: !reveal,
		});
	}
}

async function deleteNamespace(ns: Namespace) {
	console.log();
	console.log(
		chalk.red(
			"WARNING! This is a destructive action that will delete the namespace\nand all resources within the namespace"
		)
	);
	console.log();

	const answer = await enquirer.prompt<{ confirmString: string }>({
		type: "input",
		name: "confirmString",
		required: true,
		message: `Type "delete ${ns.metadata.name}" to confirm:`,
	});

	if (answer.confirmString === `delete ${ns.metadata.name}`) {
		console.log("Deleting...");
		await deleteKubeNamespace(ns.metadata.name);
		await sleep(5000); // give extra time for it to delete, k8s takes some time...
		console.log();
		log.success(`✅ Namespace ${ns.metadata.name} was deleted`);
		await sleep(2000);
		popScreen();
	} else {
		console.log();
		console.log("Invalid confirmation, will not do anything...");
		await sleep(2000);
		resetScreen();
	}
}

async function editSecrets({ namespace, secret: existingSecret }: { namespace: Namespace; secret?: Secret }) {
	const oldConfig = existingSecret?.data || {};

	const updatedConfig = await editConfigInEditor(maskConfig(oldConfig), EDIT_GLOBAL_SECRECTS_WARNING);

	const newOrUpdatedKeys: string[] = [];

	Object.keys(updatedConfig).forEach((k) => {
		if (isMasked(updatedConfig[k])) {
			// masked = no change
			updatedConfig[k] = oldConfig[k];
		} else {
			newOrUpdatedKeys.push(k);
		}
	});

	if (deepEqual(oldConfig, updatedConfig)) {
		console.log("No changes");
		await sleep(2000);
		return popScreen();
	}

	printConfigChanges(oldConfig, updatedConfig, true);

	if (await confirmPrompt("Do you want to save changes? Any masked secrets will be kept as-is.", true)) {
		if (!existingSecret) {
			await createSecret(
				namespace.metadata.name,
				secret(namespace.metadata.name, GLOBAL_SECRETS_NAME, {
					// will be base64 encoded during create
					...updatedConfig,
				})
			);
		} else {
			for (const k of newOrUpdatedKeys) {
				updatedConfig[k] = base64encode(updatedConfig[k]);
			}
			existingSecret.data = updatedConfig;
			await updateSecret(namespace.metadata.name, GLOBAL_SECRETS_NAME, existingSecret);
		}

		console.log();
		log.success(`🕶  Global secret(s) in namespace ${namespace.metadata.name} was updated`);
		console.log();
		await pressEnterToContinue();
	}

	popScreen();
}

async function editConfigMap({
	namespace,
	configMap: existingConfigMap,
}: {
	namespace: Namespace;
	configMap?: ConfigMap;
}) {
	const oldConfig = existingConfigMap?.data || {};
	const updatedConfig = await editConfigInEditor(oldConfig, EDIT_GLOBAL_CONFIG_WARNING);

	if (deepEqual(oldConfig, updatedConfig)) {
		console.log("No changes");
		await sleep(2000);
		return popScreen();
	}

	printConfigChanges(oldConfig, updatedConfig);

	if (await confirmPrompt("Do you want to save changes?", true)) {
		if (!existingConfigMap) {
			await createConfigMap(
				namespace.metadata.name,
				configMap(namespace.metadata.name, GLOBAL_CONFIG_NAME, {
					...updatedConfig,
				})
			);
		} else {
			existingConfigMap.data = updatedConfig;
			await updateConfigMap(namespace.metadata.name, GLOBAL_CONFIG_NAME, existingConfigMap);
		}

		console.log();
		log.success(`✅ Global config(s) in namespace ${namespace.metadata.name} was updated`);
		console.log();
		await pressEnterToContinue();
	}

	popScreen();
}
