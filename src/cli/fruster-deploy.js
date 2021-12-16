#!/usr/bin/env node

const program = require("commander");
const { getDeployment, patchDeployment, getPods } = require("../kube/kube-client");
const { validateRequiredArg, getOrSelectNamespace, getUsername } = require("../utils/cli-utils");
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");
const log = require("../log");
const { sleep } = require("../utils/cli-utils");

program
	.description(
		`
Deploy a new image tag/version.

Example:

$ fruster deploy 1.0.1 -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.option("-t, --tag <image tag>", "image tag to deploy")
	.option("--skip-verify", "skips verification that new tag was deployed")
	.parse(process.argv);

const serviceName = program.app;
const imageTag = program.tag;
let namespace = program.namespace;
const skipVerify = program.skipVerify;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(imageTag, program, "Missing image tag");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const deployment = await getDeployment(namespace, serviceName);
	const [existingImage, existingImageTag] = deployment.spec.template.spec.containers[0].image.split(":");
	const newImage = `${existingImage}:${imageTag}`;
	const username = await getUsername();

	await patchDeployment(namespace, serviceName, {
		body: {
			metadata: {
				annotations: {
					[CHANGE_CAUSE_ANNOTATION]: `${username} changed image version ${existingImageTag} -> ${imageTag}`,
				},
			},
			spec: {
				template: {
					spec: {
						containers: [{ name: serviceName, image: newImage }],
					},
				},
			},
		},
	});

	log.info(`Image tag/version changed ${existingImageTag} -> ${imageTag}`);

	if (!skipVerify) {
		log.info(`\nVeryfing deploy...`);

		const numAttempts = 20;

		for (let i = 1; i <= numAttempts; i++) {
			const pods = await getPods(namespace, serviceName);

			const pod = pods.find((pod) => {
				return pod.spec.containers[0].image === newImage;
			});

			const attemptPrefix = `\nAttempt ${i}/${numAttempts}:`;

			if (!pod) {
				log.info(`${attemptPrefix} Did not find any pod with image ${newImage}...`);
			} else if (pod.status.phase === "Running") {
				log.success(`${attemptPrefix} ✅ Pod with image ${newImage} is running`);
				process.exit(0);
			} else {
				log.info(`${attemptPrefix} Found pod with image ${newImage} but has status '${pod.status.phase}'...`);

				const { waiting } = pod.status.containerStatuses[0].state;

				if (waiting) {
					log.info(`${waiting.reason} ${waiting.message || ""}`);
				}
			}

			await sleep(2000);
		}

		log.error(`\nFailed to verify that app with image ${newImage} was deployed`);
		process.exit(1);
	}
}

run();
