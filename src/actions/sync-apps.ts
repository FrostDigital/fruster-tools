import chalk from "chalk";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { configRowsToObj, objToConfigRows, updateConfig } from "../actions/update-config";
import {
	createAppDeployment,
	deleteService,
	ensureServiceForApp,
	getConfigMap,
	getDeployments,
	getService,
	updateConfigMap,
	updateDeployment,
} from "../kube/kube-client";
import { GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import * as log from "../log";
import { Deployment } from "../models/Deployment";
import { Registry } from "../models/Registry";
import { AppManifest } from "../models/ServiceRegistryModel";
import { create } from "../service-registry/service-registry-factory";
import ServiceRegistry from "../service-registry/ServiceRegistry";
import { confirmPrompt, getUsername } from "../utils/cli-utils";
import { mergeConfig } from "../utils/config-utils";
import {
	getDeploymentAppConfig,
	getDeploymentImage,
	getNameAndNamespaceOrThrow,
	getProbeString,
	setDeploymentImage,
	setProbe,
} from "../utils/kube-utils";

type ReduceType = {
	appsToCreate: AppManifest[];
	appsToSync: { deployment: Deployment; app: AppManifest }[];
};

export async function syncApps(namespace: string, serviceRegistryFilePath: string, interactive = true) {
	const user = await getUsername();
	const registries = await getDockerRegistries();

	let svcReg: ServiceRegistry | undefined = undefined;

	try {
		svcReg = await create(serviceRegistryFilePath);
	} catch (err) {
		log.error(`Failed to read service registry at ${serviceRegistryFilePath}`);
		console.log(err);
		return;
	}

	const hasGlobalConfigChanged = await syncGlobalConfig(namespace, svcReg, true);

	const existingDeployments = await getDeployments(namespace);

	const appNames = svcReg.services.map((s) => s.name);

	if (!appNames || !appNames.length) {
		log.warn("Found no apps to create in service registry");
		return;
	}

	const { appsToCreate, appsToSync } = svcReg.services.reduce<ReduceType>(
		(out, app) => {
			const deployment = existingDeployments.items.find((item) => item.metadata?.name === app.name);

			if (deployment) {
				out.appsToSync.push({
					deployment,
					app,
				});
			} else {
				// console.log(chalk.green(`${app.name} (new)`));
				out.appsToCreate.push(app);
			}
			return out;
		},
		{
			appsToCreate: [],
			appsToSync: [],
		}
	);

	const appToSyncWithChanges: { deployment: Deployment; app: AppManifest }[] = [];

	for (const app of appsToCreate) {
		console.log(chalk.bold(`[${app.name}] Will create app ${app.name}`));
		console.log(`[${app.name}] Image ${app.image}`);
		console.log(`[${app.name}] Routable ${app.routable ? "yes" : "no"} ${(app.domains || []).join(", ")}`);
		console.log(
			`[${app.name}] Resources (request/limit) cpu ${app.resources?.cpu || "n/a"} ${app.resources?.mem || "n/a"}`
		);
		console.log(`[${app.name}] Liveness health check ${app.livenessHealthCheck || "n/a"}`);

		for (const row of objToConfigRows(app.env)) {
			console.log(`[${app.name}] ${row.name}=${row.value}`);
		}
	}

	for (const app of appsToSync) {
		if (await syncConfigurationForApp(namespace, app.app, app.deployment, true)) {
			appToSyncWithChanges.push(app);
		}
	}

	if (appsToCreate.length === 0 && appToSyncWithChanges.length === 0 && !hasGlobalConfigChanged) {
		console.log("No changes, everything is in sync 👍");
		return;
	}

	if (
		interactive &&
		!(await confirmPrompt(
			`Do you want to create ${appsToCreate.length} app(s) and update ${
				appToSyncWithChanges.length
			} app(s) (global config changed ${hasGlobalConfigChanged ? "yes" : "no"})?`,
			false
		))
	) {
		return;
	}

	await syncGlobalConfig(namespace, svcReg, false);

	for (const app of appsToCreate) {
		log.info(`Creating app ${app.name} ${app.image || ""}...`);

		let privateReg: Registry | undefined = undefined;

		if (app.registry) {
			privateReg = registries.find((r) => r.registryHost === app.registry);

			if (!privateReg) {
				log.warn(`Failed to create app: Could not find registry secrets for host ${app.registry}`);
				continue;
			}
		}

		try {
			await createAppDeployment(
				namespace,
				{
					...app,
					imagePullSecret: privateReg?.secretName,
				},
				{
					changeCause: user + " created app using fruster cli",
					hasGlobalConfig: true,
					hasGlobalSecrets: true,
				}
			);
			log.success(`✅ ${app.name} was created`);
		} catch (err) {
			log.error(`Failed to create app ${app.name}: ${err}`);
		}

		if (app.routable) {
			log.info("Service is routable, making sure that k8s service exists...");

			if (!app.env.PORT) {
				log.warn(`Cannot make app ${app.name} routable as required env config PORT is missing`);
				continue;
			}

			await ensureServiceForApp(namespace, {
				name: app.name,
				domains: app.domains || [app.name],
				port: app.env.PORT,
			});
		}
	}

	for (const app of appToSyncWithChanges) {
		log.info(`[${app.app.name}] Updating...`);
		await syncConfigurationForApp(namespace, app.app, app.deployment, false);
		log.info(`[${app.app.name}] Finished updating`);
	}
}

async function syncConfigurationForApp(
	namespace: string,
	appManifest: AppManifest,
	deployment: Deployment,
	// globalConfig: ConfigMap | null,
	preview: boolean
) {
	const { name } = getNameAndNamespaceOrThrow(deployment);
	let hasChange = false;
	const service = await getService(namespace, appManifest.name);

	if (preview) {
		log.info(`[${appManifest.name}] Checking if ${appManifest.name} has changed...`);
	}

	if (!appManifest.routable && service) {
		hasChange = true;
		if (!preview) {
			await deleteService(namespace, appManifest.name);
		} else {
			console.log(`[${appManifest.name}] routable -> ${chalk.magenta("non routable")}`);
		}
	} else if (appManifest.routable && !service) {
		hasChange = true;
		if (!appManifest.env.PORT) {
			log.warn(`[${appManifest.name}] Missing PORT for ${appManifest.name}, this is required for routable apps`);
			return;
		}

		const domains = appManifest.domains || [appManifest.name];

		if (!preview) {
			await ensureServiceForApp(namespace, { name: appManifest.name, domains, port: appManifest.env.PORT });
		} else {
			console.log(
				`[${appManifest.name}] Non routable -> ${chalk.magenta(`routable to domain(s) ${domains.join(", ")}`)}`
			);
		}
	}

	const updatedDeployment = { ...deployment };

	const existingProbeString = getProbeString(deployment, "liveness");
	const newProbeString = appManifest.livenessHealthCheck;

	if (existingProbeString !== newProbeString) {
		hasChange = true;
		if (preview) {
			console.log(
				`[${appManifest.name}] Updating liveness health check ${
					existingProbeString || "none"
				} -> ${chalk.magenta(newProbeString || "none")}`
			);
		} else {
			setProbe(newProbeString || "", updatedDeployment, "liveness");
		}
	}

	const { config } = await getDeploymentAppConfig(updatedDeployment);

	const updatedConfig = mergeConfig(appManifest.name, configRowsToObj(config), appManifest.env, true);

	if (updatedConfig) {
		hasChange = true;

		updateConfig({
			deployment,
			set: updatedConfig,
			saveChanges: false,
		});
	}

	const existingImage = getDeploymentImage(deployment);
	const newImage = appManifest.image + ":" + appManifest.imageTag;

	if (existingImage !== newImage) {
		hasChange = true;
		console.log(`[${appManifest.name}] Image updated ${existingImage} -> ${chalk.magenta(appManifest.image)}`);
		setDeploymentImage(deployment, newImage);
	}

	// TODO: resources

	if (!preview) {
		await updateDeployment(namespace, name, updatedDeployment);
	} else if (hasChange) {
		console.log(chalk.red(`[${appManifest.name}] Has change(s)`));
	} else {
		console.log(chalk.green(`[${appManifest.name}] Up to date`));
	}

	return hasChange;
}

async function syncGlobalConfig(namespace: string, svcReg: ServiceRegistry, preview: boolean) {
	const globalConfig = await getConfigMap(namespace, GLOBAL_CONFIG_NAME);

	if (svcReg.apiVersion === "1") {
		// Version 1 does not have support for global config
		return;
	}

	if (globalConfig) {
		globalConfig.data = globalConfig?.data || {};
		const updatedConfig = mergeConfig("Global config", globalConfig.data, svcReg.globalEnv || {}, true);

		if (updatedConfig) {
			if (!preview) {
				await updateConfigMap(namespace, GLOBAL_CONFIG_NAME, { ...globalConfig, data: updatedConfig });
			} else {
				// TODO
			}
			return true;
		} else if (preview) {
			console.log(chalk.green(`Global config is up to date`));
		}
	}

	return false;
}
