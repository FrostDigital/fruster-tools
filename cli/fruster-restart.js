#!/usr/bin/env node

const program = require("commander");
const { patchDeployment } = require("../lib/kube/kube-client");
const log = require("../lib/log");
const { validateRequiredArg, getOrSelectNamespace, getUsername } = require("../lib/utils/cli-utils");

program
	.description(
		`
Restart application.

Example:

$ fruster restart -a api-gateway
`
	)
	.option("-r, --replicas <replicas>", "number of replicas")
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.parse(process.argv);

const serviceName = program.app;
let namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const username = await getUsername();

	await patchDeployment(namespace, serviceName, {
		body: {
			spec: {
				template: {
					metadata: {
						annotations: {
							"kubernetes.io/change-cause": `Restart by ${username}`
						}
					}
				}
			}
		}
	});

	log.info(`Performing rolloing restart off ${serviceName}, check progress with "fruster apps"`);
}

run();
