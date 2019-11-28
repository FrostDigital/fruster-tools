#!/usr/bin/env node

const program = require("commander");
const { getConfig, setConfig, restartPods } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg } = require("../lib/utils/cli-utils");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <serviceName>", "name of service")
	.option("--no-restart", "set config but do not restart service")
	.description(
		`
Sets config for an app.

Use this with precaution since most configuration should be persisted in service registry.

Example:

$ fruster config set BUS=nats://localhost:4222 LOG_LEVEL=DEBUG -a api-gateway -n paceup
`
	)
	.parse(process.argv);

const serviceName = program.app;
const namespace = program.namespace;
const config = program.args;
const noRestart = program.noRestart;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(namespace, program, "Missing namespace");
validateRequiredArg(config.length, program, "Missing config");

async function run() {
	const configMap = {};

	config.forEach(configStr => {
		const [key, value] = configStr.split("=");

		if (!value) {
			log.error(`Invalid config ${configStr}, write on format KEY=VALUE`);
			return process.exit(1);
		}

		configMap[key] = value;
	});

	try {
		const existingConfig = await getConfig(namespace, serviceName);

		if (!existingConfig) {
			log.error("Could not find config for service " + serviceName);
			return process.exit(1);
		}

		let hasChange = false;

		for (const k in configMap) {
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

		await setConfig(namespace, serviceName, mergedConfig);

		log.success(`✅ Updated config ${Object.keys(configMap).join(", ")}\n`);

		if (!noRestart) {
			const restart = await restartPods(namespace, serviceName, true);

			if (restart) {
				log.info("Pod(s) is being restarted, it may take a couple of seconds until running again...\n");
			}
		}

		log.info("=== " + serviceName + "\n" + JSON.stringify(mergedConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
