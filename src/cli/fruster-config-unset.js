#!/usr/bin/env node

const { program } = require("commander");
const { updateConfig } = require("../actions/update-config");
const { restartPods } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespaceForApp } = require("../utils/cli-utils");

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

const serviceName = program.opts().app;
let namespace = program.opts().namespace;
const config = program.args;
const noRestart = program.opts().noRestart;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(config.length, program, "Missing config");

async function run() {
	try {
		if (!namespace) {
			namespace = await getOrSelectNamespaceForApp(serviceName);
		}

		const updatedConfig = await updateConfig({
			serviceName,
			namespace,
			unset: config,
		});

		log.success(`✅ Removed config ${config.join(", ")}\n`);

		if (!noRestart) {
			const restart = await restartPods(namespace, serviceName, true);

			if (restart) {
				log.info("Pod(s) is being restarted, it may take a couple of seconds until running again...\n");
			}
		}

		log.info("=== " + serviceName + "\n" + JSON.stringify(updatedConfig, null, 2));
	} catch (err) {
		console.log(err);
		process.exit(1);
	}
}

run();
