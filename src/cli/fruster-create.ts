#!/usr/bin/env node

import { program } from "commander";
import { createFrusterNamespace } from "../actions/create-fruster-namespace";
import { createAppDeployment, ensureServiceForApp } from "../kube/kube-client";
import * as log from "../log";
import { create } from "../service-registry";

const { getUsername } = require("../utils/cli-utils");

program
	.description(
		`
Creates kubernetes deployments for services that are defined service registry.

Namespace will be created if it does not already exists.

Examples:

# Creates deployments for services that are defined in service registry json file
$ fctl create -s services.json -n my-namespace
`
	)
	.option("-y, --yes", "perform the change, otherwise just dry run, only applicable in non interactive mode")
	.requiredOption("-n, --namespace <namespace>", "kubernetes namespace that service(s) should be created in")
	.option("-s, --service-registry <file>", "service registry json file")
	.option("-a, --app <app>", "name of app (a.k.a. service)")
	.parse(process.argv);

const dryRun = !program.opts().yes;
const serviceRegPath = program.opts().serviceRegistry;
const namespace = program.opts().namespace;
const app = program.opts().app;

async function run() {
	if (!app && !serviceRegPath) {
		log.error(
			`\nEither --service-registry or --app must be set\n\nExamples:\n$ fctl create -a my-app -n my-namespace\n$ fctl create --service-registry services.json -n my-namespace`
		);
		process.exit(1);
	}

	const username = await getUsername();

	await createAppsFromServiceRegistry();

	async function createAppsFromServiceRegistry() {
		const serviceRegistry = await create(serviceRegPath);

		const apps = serviceRegistry.getServices("*");

		if (!apps.length) {
			log.error("Could not find configuration for services, is service registry empty?");
			return process.exit(1);
		}

		// Upsert namespace
		if (!dryRun) {
			await createFrusterNamespace(namespace);
		}

		for (const appConfig of apps) {
			if (!appConfig.image) {
				log.warn("No 'image' set for service " + appConfig.name);
				continue;
			}

			if (!dryRun) {
				// Upsert deployment based on configuration from service registry
				await createAppDeployment(namespace, appConfig, {
					changeCause: username + " created app",
					hasGlobalConfig: true,
					hasGlobalSecrets: true,
				});
			} else {
				log.info(`[Dry run] Skipping create deployment`);
			}

			log.success("Created deployment");

			if (appConfig.routable) {
				log.info("Service is routable, making sure that service exists...");

				if (!dryRun) {
					const created = await ensureServiceForApp(namespace, { ...appConfig, port: appConfig.env.PORT });
					log.success(`Service ${created ? "was created" : "already exists"}`);
				} else {
					log.info(`[Dry run] Skipping make routable`);
				}
			}
		}
	}
}

run();
