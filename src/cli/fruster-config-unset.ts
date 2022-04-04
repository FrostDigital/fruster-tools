#!/usr/bin/env node

import { program } from "commander";
import { updateConfig } from "../actions/update-config";
import { getConfigMap, restartPods, updateConfigMap } from "../kube/kube-client";
import { GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import * as log from "../log";
import { validateRequiredArg } from "../utils/cli-utils";

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <app>", "name of app")
	.option("-g, --global", "if global config")
	.description(
		`
Removes config.

Example:

# Removes configs BUS and LOG_LEVEL from apps config
$ fctl config unset BUS LOG_LEVEL -a api-gateway -n my-namespace

# Removes config FOO from global config
$ fctl config unset FOO -n my-namespace
`
	)
	.parse(process.argv);

const appName = program.opts().app;
const namespace = program.opts().namespace;
const config = program.args;
const isGlobal = !!program.opts().global;

validateRequiredArg(config.length, program, "Missing config");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	try {
		if (isGlobal && appName) {
			log.warn("Both --global and --app is provided"),
				console.log("Use -g, --global to unset global configuration within namespace");
			console.log("Use -a, --app to unset app specific configuration");
			process.exit(1);
		}

		if (isGlobal) {
			const existingGlobalConfig = await getConfigMap(namespace, GLOBAL_CONFIG_NAME);

			let hasChange = false;

			if (existingGlobalConfig) {
				existingGlobalConfig.data = existingGlobalConfig?.data || {};

				for (const k of config) {
					if (existingGlobalConfig.data[k]) {
						hasChange = true;
						delete existingGlobalConfig.data[k];
					}
				}

				if (hasChange) {
					await updateConfigMap(namespace, GLOBAL_CONFIG_NAME, existingGlobalConfig);
					log.success(`✅ Removed global config ${config.join(", ")}\n`);
					log.info(
						`=== Global config for namespace ${namespace}\n ${JSON.stringify(
							existingGlobalConfig.data,
							null,
							2
						)}`
					);

					return;
				}
			}
			log.success("Already up to date 👍");
			return;
		}

		if (!appName) {
			log.error("Missing app name");
			process.exit(1);
		}

		const updatedConfig = await updateConfig({
			serviceName: appName,
			namespace,
			unset: config,
		});

		log.success(`✅ Removed config ${config.join(", ")}\n`);

		log.info("=== " + appName + "\n" + JSON.stringify(updatedConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
