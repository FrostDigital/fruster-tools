import enquirer from "enquirer";
import { existsSync, writeFileSync } from "fs";
import { configRowsToObj } from "../actions/update-config";
import { getConfigMap, getDeployments, getService } from "../kube/kube-client";
import { DOMAINS_ANNOTATION, FRUSTER_LIVENESS_ANNOTATION } from "../kube/kube-constants";
import { GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import { AppManifest, ServiceRegistryModel } from "../models/ServiceRegistryModel";
import { confirmPrompt, pressEnterToContinue, selectNamespace } from "../utils/cli-utils";
import { getDeploymentAppConfig } from "../utils/kube-utils";
import { popScreen } from "./engine";

/**
 * Exports apps to service registry file.
 */
export async function exportApps() {
	const ns = await selectNamespace({
		message: "Select namespace",
		frusterNamespace: true,
	});

	// const includeSecrets = await confirmPrompt("Do you want to include secrets?", false);

	const deployments = await getDeployments(ns);

	const globalConfig = await getConfigMap(ns, GLOBAL_CONFIG_NAME);

	const globalEnv = globalConfig?.data;

	const apps: AppManifest[] = [];

	for (const deployment of deployments.items) {
		const svc = await getService(ns, deployment.metadata.name);
		const domains = svc ? ((svc.metadata.annotations || {})[DOMAINS_ANNOTATION] || "").split(",") : undefined;

		const resources = deployment.spec.template.spec.containers[0].resources;
		let appResources: AppManifest["resources"] = undefined;

		if (resources) {
			appResources = {
				cpu: resources.requests?.cpu + "/" + resources.limits?.cpu,
				mem: resources.requests?.memory + "/" + resources.limits?.memory,
			};
		}

		const hasFrusterHealth = !!(deployment.metadata.annotations || {})[FRUSTER_LIVENESS_ANNOTATION];

		const { config } = getDeploymentAppConfig(deployment);

		apps.push({
			name: deployment.metadata.name,
			image: deployment.spec.template.spec.containers[0].image,
			env: configRowsToObj(config),
			domains,
			routable: !!svc,
			resources: appResources,
			livenessHealthCheck: hasFrusterHealth ? "fruster-health" : undefined,
		});
	}

	const serviceReg: ServiceRegistryModel = {
		name: ns,
		apiVersion: "1",
		env: globalEnv,
		services: apps,
	};

	console.log();
	console.log("Generated service registry:");
	console.log();

	const stringifiedServiceReg = JSON.stringify(serviceReg, null, 2);

	console.log(stringifiedServiceReg);

	if (await confirmPrompt("Save to file?", true)) {
		const { filename } = await enquirer.prompt<{ filename: string }>({
			type: "input",
			name: "filename",
			message: "Enter file",
			initial: process.cwd() + "/services-" + ns + ".json",
		});

		if (
			!existsSync(filename) ||
			(await confirmPrompt(`File ${filename} already exists, do you want to overwrite it?`, false))
		) {
			writeFileSync(filename, stringifiedServiceReg);
			console.log("Wrote file", filename);
		}
	}

	await pressEnterToContinue();
	popScreen();
}
