import chalk from "chalk";
import enquirer from "enquirer";
import { getDockerRegistries } from "../actions/get-docker-registries";
import { configRowsToObj, updateConfig } from "../actions/update-config";
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
import { confirmPrompt, getUsername, pressEnterToContinue, selectNamespace } from "../utils/cli-utils";
import { mergeConfig } from "../utils/config-utils";
import {
	disableFrusterHealth,
	enableFrusterHealth,
	getDeploymentAppConfig,
	getDeploymentImage,
	hasFrusterHealth,
	setDeploymentImage,
} from "../utils/kube-utils";
import { popScreen } from "./engine";

type ReduceType = {
	appsToCreate: AppManifest[];
	appsToSync: { deployment: Deployment; app: AppManifest }[];
};

export async function importApps() {
	const user = await getUsername();
	const registries = await getDockerRegistries();

	const { path } = await enquirer.prompt<{ path: string }>({
		message: "Enter service registry path",
		name: "path",
		type: "input",
		initial: process.cwd(),
	});

	let svcReg: ServiceRegistry | undefined = undefined;

	try {
		svcReg = await create(path);
	} catch (err) {
		log.error(`Failed to read service registry at ${path}`);
		console.log(err);
		await pressEnterToContinue();
		popScreen();
		return;
	}

	const namespace = await selectNamespace({
		message: "Select namespace app(s) should be created in",
		frusterNamespace: true,
	});

	await syncGlobalConfig(namespace, svcReg, true);

	const existingDeployments = await getDeployments(namespace);

	const appNames = svcReg.services.map((s) => s.name);

	if (!appNames || !appNames.length) {
		log.warn("Found no apps to create in service registry");
		await pressEnterToContinue();
		return popScreen();
	}

	const { appsToCreate, appsToSync } = svcReg.services.reduce<ReduceType>(
		(out, app) => {
			const deployment = existingDeployments.items.find((item) => item.metadata.name === app.name);

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

	for (const app of appsToSync) {
		if (await syncConfigurationForApp(namespace, app.app, app.deployment, true)) {
			appToSyncWithChanges.push(app);
		}
	}

	if (appsToCreate.length === 0 && appToSyncWithChanges.length === 0) {
		console.log("No changes, everything is in sync 👍");
		await pressEnterToContinue();
		popScreen();
		return;
	}

	if (
		!(await confirmPrompt(
			`Do you want to create ${appsToCreate.length} app(s) and update ${appToSyncWithChanges.length} app(s)?`,
			false
		))
	) {
		return popScreen();
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

	await pressEnterToContinue();

	popScreen();
}

async function syncConfigurationForApp(
	namespace: string,
	appManifest: AppManifest,
	deployment: Deployment,
	// globalConfig: ConfigMap | null,
	preview: boolean
) {
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

	if (appManifest.livenessHealthCheck === "fruster-health" && !hasFrusterHealth(deployment)) {
		hasChange = true;
		if (preview) {
			console.log("[" + appManifest.name + "]", chalk.magenta("Enabling fruster health"));
		} else {
			enableFrusterHealth(updatedDeployment);
		}
	} else if (
		(!appManifest.livenessHealthCheck || appManifest.livenessHealthCheck === "none") &&
		hasFrusterHealth(deployment)
	) {
		hasChange = true;
		if (preview) {
			console.log("[" + appManifest.name + "]", chalk.magenta(`Disabling fruster health`));
		} else {
			disableFrusterHealth(updatedDeployment);
		}
	}

	const { config } = getDeploymentAppConfig(updatedDeployment);

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
		await updateDeployment(namespace, deployment.metadata.name, updatedDeployment);
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
		const updatedConfig = mergeConfig("Global config", globalConfig.data, svcReg.globalEnv || {}, true);

		if (updatedConfig) {
			if (!preview) {
				await updateConfigMap(namespace, GLOBAL_CONFIG_NAME, { ...globalConfig, data: updatedConfig });
			} else {
				// TODO
			}
		} else if (preview) {
			console.log(chalk.green(`Global config is up to date`));
		}
	}
}
