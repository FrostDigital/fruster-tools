#!/usr/bin/env node

const { program } = require("commander");
const { getDeployment } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg } = require("../utils/cli-utils");
const { getOrSelectNamespaceForApp } = require("../utils/cli-utils");
const { updateConfig, configRowsToObj } = require("../actions/update-config");
const { getDeploymentAppConfig } = require("../utils/kube-utils");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <serviceName>", "name of service")
	.description(
		`
Sets config for an app.

Use this with precaution since most configuration should be persisted in service registry.

Example:

$ fctl config set BUS=nats://localhost:4222 LOG_LEVEL=DEBUG -a api-gateway -n paceup
`
	)
	.parse(process.argv);

const serviceName = program.opts().app;
let namespace = program.opts().namespace;
const config = program.args;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(config.length, program, "Missing config");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespaceForApp(serviceName);
	}

	const configMap = {};

	config.forEach((configStr) => {
		const [key, value] = configStr.split("=");

		if (!value) {
			log.error(`Invalid config ${configStr}, write on format KEY=VALUE`);
			return process.exit(1);
		}

		// @ts-ignore
		configMap[key] = value;
	});

	try {
		const deployment = await getDeployment(namespace, serviceName);

		if (!deployment) {
			log.error("Could not find deployment for app " + serviceName);
			return process.exit(1);
		}

		const { config } = getDeploymentAppConfig(deployment);
		const existingConfig = configRowsToObj(config);

		let hasChange = false;

		for (const k in configMap) {
			// @ts-ignore
			if (existingConfig[k] !== configMap[k]) {
				hasChange = true;
				break;
			}
		}

		if (!hasChange) {
			log.success("Already up to date 👍");
			return;
		}

		const mergedConfig = { ...existingConfig, ...configMap };

		// Patch deployment to trigger rolling update with new config
		await updateConfig({
			namespace,
			serviceName,
			set: mergedConfig,
		});

		log.success(`✅ Updated config ${Object.keys(configMap).join(", ")}\n`);

		log.info("=== " + serviceName + "\n" + JSON.stringify(mergedConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
