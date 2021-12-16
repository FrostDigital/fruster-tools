#!/usr/bin/env node

const program = require("commander");
const { getConfig, setConfig, restartPods } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespace } = require("../utils/cli-utils");

program
	.option("-n, --namespace <namespace>", "kubernetes namespace that services operates in")
	.option("-a, --app <serviceName>", "name of app")
	.option("--no-restart", "remove config but do not restart service")
	.description(
		`
Removes config from an app.

Example:

$ fruster config unset BUS LOG_LEVEL -a api-gateway -n paceup
`
	)
	.parse(process.argv);

const serviceName = program.app;
let namespace = program.namespace;
const config = program.args;
const noRestart = program.noRestart;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(config.length, program, "Missing config");

async function run() {
	try {
		if (!namespace) {
			namespace = await getOrSelectNamespace(serviceName);
		}

		const existingConfig = await getConfig(namespace, serviceName);
		const newConfig = { ...existingConfig };

		if (!existingConfig) {
			log.error("Could not find config for service " + serviceName);
			return process.exit(1);
		}

		let hasChange = false;

		for (const conf of config) {
			if (existingConfig[conf]) hasChange = true;
			delete newConfig[conf];
		}

		if (!hasChange) {
			log.success("Already up to date 👍");
			return;
		}

		await setConfig(namespace, serviceName, newConfig);

		log.success(`✅ Removed config ${config.join(", ")}\n`);

		if (!noRestart) {
			const restart = await restartPods(namespace, serviceName, true);

			if (restart) {
				log.info("Pod(s) is being restarted, it may take a couple of seconds until running again...\n");
			}
		}

		log.info("=== " + serviceName + "\n" + JSON.stringify(newConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
