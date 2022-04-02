import crypto from "crypto";
import { patchDeployment } from "../kube/kube-client";
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");
import * as log from "../log";

/**
 * Set hash of config for deployment to trigger rollout.
 * Idea taken from here:
 * https://blog.questionable.services/article/kubernetes-deployments-configmap-change/
 *
 * @param {string} namespace
 * @param {string} serviceName
 * @param {any} config
 * @param {string} changeCause
 */
export async function patchDeploymentWithConfigHash(
	namespace: string,
	serviceName: string,
	config: { [x: string]: string },
	changeCause: string
) {
	const configHash = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");

	await patchDeployment(namespace, serviceName, {
		body: {
			metadata: {
				annotations: {
					[CHANGE_CAUSE_ANNOTATION]: changeCause,
				},
			},
			spec: {
				template: {
					metadata: { annotations: { configHash } },
				},
				containers: [
					{
						env: Object.keys(config).map((key) => ({
							name: key,
							value: config[key],
						})),
					},
				],
			},
		},
	});
}

/**
 *
 */
export function mergeConfig(
	appName: string,
	existingConfig: { [x: string]: string },
	newConfig: { [x: string]: string },
	prune?: boolean
) {
	let mergedConfig: { [x: string]: string } | null = {};
	let upToDate = true;

	for (const k in existingConfig) {
		if (newConfig[k] === undefined) {
			if (prune) {
				log.warn(`[${appName}] Will remove ${k} (value was "${existingConfig[k]}")`);
				upToDate = false;
			} else {
				log.warn(
					`[${appName}] App has config ${k} which is missing in service registry, use --prune to remove this, current value is "${existingConfig[k]}"`
				);
				mergedConfig[k] = existingConfig[k];
			}
		} else if (existingConfig[k] != newConfig[k]) {
			console.log(`[${appName}] Updating ${k} ${existingConfig[k]} -> ${newConfig[k]}`);
			mergedConfig[k] = newConfig[k];
			upToDate = false;
		} else {
			log.debug(`[${appName}] Config ${k} is up to date`);
			mergedConfig[k] = newConfig[k];
		}
	}

	for (const k in newConfig) {
		if (existingConfig[k] === undefined) {
			console.log(`[${appName}] New config ${k}=${newConfig[k]}`);
			mergedConfig[k] = newConfig[k];
			upToDate = false;
		}
	}

	if (upToDate) {
		// log.success(`[${appName}] env config is up to date`);
		mergedConfig = null;
	}

	return mergedConfig;
}
