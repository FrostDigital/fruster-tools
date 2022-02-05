import crypto from "crypto";
import { getConfig, getDeployment, setConfig, updateDeployment } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";

export async function updateConfig(serviceName: string, namespace: string, updates: { key: string; value: string }[]) {
	const existingConfig = await getConfig(namespace, serviceName);
	const deployment = await getDeployment(namespace, serviceName);

	if (!existingConfig) {
		log.error("Could not find config for service " + serviceName);
		return process.exit(1);
	}

	let mergedConfig = { ...existingConfig };
	let changes: { removed: string[]; updated: string[]; added: string[]; hasChange: boolean } = {
		removed: [],
		updated: [],
		added: [],
		hasChange: false,
	};

	for (let { key, value } of updates) {
		value = typeof value === "string" ? value.trim() : value;

		if (existingConfig[key] !== value) {
			changes.hasChange = true;

			if (!existingConfig[key]) {
				changes.added.push(key);
			} else if (value) {
				changes.updated.push(key);
			}
		}

		if (mergedConfig[key] !== undefined && !value) {
			delete mergedConfig[key];
			changes.removed.push(key);
		} else {
			mergedConfig[key] = value;
		}
	}

	if (!changes.hasChange) {
		log.success("Already up to date 👍");
		return changes;
	}

	// Update config stored in secrets
	await setConfig(namespace, serviceName, mergedConfig);

	// Update config refs in deployment
	deployment.spec.template.spec.containers[0].env = Object.keys(mergedConfig).map((key) => ({
		name: key,
		valueFrom: {
			secretKeyRef: {
				key,
				name: serviceName + "-config",
			},
		},
	}));

	deployment.metadata.annotations[CHANGE_CAUSE_ANNOTATION] = `Config ${updates
		.map((u) => u.key)
		.join(",")} was updated`;

	const configHash = crypto.createHash("sha256").update(JSON.stringify(mergedConfig)).digest("hex");

	deployment.spec.template.metadata.annotations.configHash = configHash;

	await updateDeployment(namespace, serviceName, deployment);

	return changes;
}
