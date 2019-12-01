#!/usr/bin/env node

const program = require("commander");
const { getDeployment, patchDeployment } = require("../lib/kube/kube-client");
const { validateRequiredArg, getOrSelectNamespace, getUsername } = require("../lib/utils/cli-utils");

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
	.parse(process.argv);

const serviceName = program.app;
const imageTag = program.tag;
let namespace = program.namespace;

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(imageTag, program, "Missing image tag");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	const deployment = await getDeployment(namespace, serviceName);
	const [existingImage, existingImageTag] = deployment.spec.template.spec.containers[0].image.split(":");

	const username = await getUsername();

	await patchDeployment(namespace, serviceName, {
		body: {
			spec: {
				template: {
					metadata: {
						annotations: {
							"kubernetes.io/change-cause": `${username} changed image version ${existingImageTag} -> ${imageTag}`
						}
					},
					spec: {
						containers: [{ name: serviceName, image: `${existingImage}:${imageTag}` }]
					}
				}
			}
		}
	});
}

run();
