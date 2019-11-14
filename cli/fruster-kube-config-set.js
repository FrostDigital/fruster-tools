#!/usr/bin/env node

const program = require("commander");
const { getConfig, setConfig, restartPods } = require("../lib/kube/kube-client");
const log = require("../lib/log");

program
	.option("-n, --no-restart", "set config but do not restart service")
	.description(
		`
Set config for a service (a.k.a app, a.k.a. deployment).

Example:

$ fruster kube config set BUS=nats://localhost:4222 LOG_LEVEL=DEBUG api-gateway
`
	)
	.parse(process.argv);

async function run() {
	const serviceName = program.args[program.args.length - 1];
	const config = program.args.slice(0, program.args.length - 1);
	const noRestart = program.noRestart;

	if (!config.length || !serviceName) {
		log.warn("Missing config and/or service name");
		return process.exit(1);
	}

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
		const existingConfig = await getConfig(serviceName);

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

		await setConfig(serviceName, mergedConfig);

		log.success(`✅ Updated config ${Object.keys(configMap).join(", ")}\n`);

		if (!noRestart) {
			const restart = await restartPods(serviceName, true);

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
