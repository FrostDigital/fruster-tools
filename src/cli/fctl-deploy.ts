#!/usr/bin/env node
import { program } from "commander";
import { updateImage } from "../actions/update-image";
import { validateRequiredArg } from "../utils/cli-utils";

program
	.description(
		`
Deploy a new tag/version of an existing app.

Example:

$ fctl deploy 1.0.1 -a api-gateway -n my-namespace
`
	)
	.option("-n, --namespace <namespace>", "namespace app is in")
	.option("-a, --app <app>", "name of app")
	.option("-t, --tag <image tag>", "image tag to deploy")
	.option("--skip-verify", "skips verification that new tag was deployed")
	.parse(process.argv);

const serviceName = program.getOptionValue("app");
const imageTag = program.getOptionValue("tag");
const namespace = program.getOptionValue("namespace");
const skipVerify = program.getOptionValue("skipVerify");

validateRequiredArg(serviceName, program, "Missing app name");
validateRequiredArg(imageTag, program, "Missing image tag");
validateRequiredArg(namespace, program, "Missing namespace");

async function run() {
	await updateImage(serviceName, namespace, imageTag, !skipVerify);
}

run();
