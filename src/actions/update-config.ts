import crypto from "crypto";
import { getConfig, getDeployment, setConfig, updateDeployment } from "../kube/kube-client";
import { CHANGE_CAUSE_ANNOTATION } from "../kube/kube-constants";
import * as log from "../log";
import deepEqual from "deep-equal";

export async function updateConfig(serviceName: string, namespace: string, newConfig: { [key: string]: string }) {
	const existingConfig = await getConfig(namespace, serviceName);
	const deployment = await getDeployment(namespace, serviceName);

	if (!existingConfig) {
		log.error(`Could not find config for service ${serviceName} in namespace ${namespace}`);
		return process.exit(1);
	}

	if (deepEqual(existingConfig, newConfig)) {
		log.success("Already up to date 👍");
		return;
	}

	// Update config stored in k8s secret
	await setConfig(namespace, serviceName, newConfig);

	deployment.metadata.annotations[CHANGE_CAUSE_ANNOTATION] = `Config was updated`;

	const configHash = crypto.createHash("sha256").update(JSON.stringify(newConfig)).digest("hex");

	deployment.spec.template.metadata.annotations.configHash = configHash;

	await updateDeployment(namespace, serviceName, deployment);
}
