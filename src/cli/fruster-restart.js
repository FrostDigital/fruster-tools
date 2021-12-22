#!/usr/bin/env node

const { program } = require("commander");
const { patchDeployment } = require("../kube/kube-client");
const log = require("../log");
const { validateRequiredArg, getOrSelectNamespace, getUsername } = require("../utils/cli-utils");
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");

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

const serviceName = program.opts().app;
let namespace = program.opts().namespace;

validateRequiredArg(serviceName, program, "Missing app name");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const username = await getUsername();

	await patchDeployment(namespace, serviceName, {
		body: {
			metadata: {
				annotations: {
					[CHANGE_CAUSE_ANNOTATION]: `${username} restarted app`,
				},
			},
			spec: { template: { metadata: { annotations: { restart: "true" } } } },
		},
	});

	log.info(`Performing rolloing restart off ${serviceName}, check progress with "fruster apps"`);
}

run();