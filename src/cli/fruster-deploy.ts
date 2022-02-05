#!/usr/bin/env node
import { program } from "commander";
import { updateImage } from "../actions/update-image";
import { validateRequiredArg, getOrSelectNamespace } from "../utils/cli-utils";

program
	.description(
		`
Deploy a new tag/version of an existing app.

Example:

$ fruster deploy 1.0.1 -a api-gateway
`
	)
	.option("-n, --namespace <namespace>", "kubernetes namespace service is in")
	.option("-a, --app <serviceName>", "name of service")
	.option("-t, --tag <image tag>", "image tag to deploy")
	.option("--skip-verify", "skips verification that new tag was deployed")
	.parse(process.argv);

const serviceName = program.getOptionValue("app");
const imageTag = program.getOptionValue("tag");
let namespace = program.getOptionValue("namespace");
const skipVerify = program.getOptionValue("skipVerify");

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(imageTag, program, "Missing image tag");

async function run() {
	if (!namespace) {
		namespace = await getOrSelectNamespace(serviceName);
	}

	await updateImage(serviceName, namespace, imageTag, !skipVerify);
}

run();
