#!/usr/bin/env node

import { program } from "commander";
import { configRowsToObj, updateConfig } from "../actions/update-config";
import { createConfigMap, getConfigMap, getDeployment, getNamespace, updateConfigMap } from "../kube/kube-client";
import { configMap, GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import * as log from "../log";
import { validateRequiredArg } from "../utils/cli-utils";
import { getDeploymentAppConfig } from "../utils/kube-utils";

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <app>", "name of app")
	.option("-g, --global", "if global config")
	.description(
		`
Sets config for an app or global config for a namespace.

Example:

# Set config for app
$ fctl config set FOO=bar LOG_LEVEL=DEBUG -a api-gateway -n my-namespace

# Set global config which is available for all apps within the namespace
$ fctl config set FOO=bar -g -n my-namespace
`
	)
	.parse(process.argv);

const serviceName = program.opts().app;
let namespace = program.opts().namespace;
const config = program.args;
const isGlobal = !!program.opts().global;

validateRequiredArg(namespace, program, "Missing namespace");
validateRequiredArg(config.length, program, "Missing config");

async function run() {
	const ns = await getNamespace(namespace);

	if (!ns) {
		log.error(`Namespace ${namespace} does not exist`);
		process.exit(1);
	}

	if (isGlobal && serviceName) {
		log.warn("Both --global and --app is provided"),
			console.log("Use -g, --global to set global configuration within namespace");
		console.log("Use -a, --app to set app specific configuration");
		process.exit(1);
	}

	const newConfigMap: { [x: string]: string } = {};

	config.forEach((configStr) => {
		const [key, value] = configStr.split("=");

		if (!value) {
			log.error(`Invalid config ${configStr}, write on format KEY=VALUE`);
			return process.exit(1);
		}

		newConfigMap[key] = value;
	});

	if (isGlobal) {
		// Update namespace's config map
		const existingGlobalConfig = await getConfigMap(namespace, GLOBAL_CONFIG_NAME);

		if (!existingGlobalConfig) {
			await createConfigMap(namespace, configMap(namespace, GLOBAL_CONFIG_NAME, newConfigMap));
		} else {
			let hasChange = false;
			for (const k in newConfigMap) {
				existingGlobalConfig.data = existingGlobalConfig?.data || {};
				if (existingGlobalConfig.data[k] !== newConfigMap[k]) {
					hasChange = true;
					break;
				}
			}

			if (hasChange) {
				existingGlobalConfig.data = { ...existingGlobalConfig.data, ...newConfigMap };
				await updateConfigMap(namespace, GLOBAL_CONFIG_NAME, existingGlobalConfig);
				log.success(`✅ Updated global config ${Object.keys(newConfigMap).join(", ")}\n`);

				log.info(
					`=== Global config for namespace ${namespace}\n ${JSON.stringify(
						existingGlobalConfig.data,
						null,
						2
					)}`
				);
			} else {
				log.success("Already up to date 👍");
			}
		}
		return;
	}

	try {
		const deployment = await getDeployment(namespace, serviceName);

		if (!deployment) {
			log.error("Could not find deployment for app " + serviceName);
			return process.exit(1);
		}

		const { config } = await getDeploymentAppConfig(deployment);
		const existingConfig = configRowsToObj(config);

		let hasChange = false;

		for (const k in newConfigMap) {
			if (existingConfig[k] !== newConfigMap[k]) {
				hasChange = true;
				break;
			}
		}

		if (!hasChange) {
			log.success("Already up to date 👍");
			return;
		}

		const mergedConfig = { ...existingConfig, ...newConfigMap };

		// Patch deployment to trigger rolling update with new config
		await updateConfig({
			namespace,
			serviceName,
			set: mergedConfig,
		});

		log.success(`✅ Updated config ${Object.keys(newConfigMap).join(", ")}\n`);

		log.info("=== " + serviceName + "\n" + JSON.stringify(mergedConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
