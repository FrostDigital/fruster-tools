import { createDeployment, ensureServiceForApp, getDeployment, getService } from "../kube/kube-client";
import { REQUIRED_ENV_CONFIG } from "../kube/kube-constants";
import * as log from "../log";
import { getFirstContainerOrThrow } from "../utils/kube-utils";

export async function cloneApp(namespace: string, name: string, newName: string) {
	const existingDeployment = await getDeployment(namespace, name);

	if (!existingDeployment) {
		throw new Error(`Cannot clone app - no deployment in namespace "${namespace}" with name "${name}" exists`);
	}

	if (existingDeployment.metadata) {
		console.log("Cloning k8s deployment...");
		delete existingDeployment.metadata.creationTimestamp;
		delete existingDeployment.metadata.uid;
		delete existingDeployment.metadata.resourceVersion;
		delete existingDeployment.status;

		existingDeployment.metadata.name = newName;

		const container = getFirstContainerOrThrow(existingDeployment);

		for (const env of container.env || []) {
			if (REQUIRED_ENV_CONFIG.includes(env.name)) {
				env.value = newName;
			}
		}
	}

	await createDeployment(namespace, existingDeployment);

	const existingService = await getService(namespace, name);

	if (existingService) {
		console.log("Cloning k8s service...");

		if (!existingService.spec?.ports) {
			throw new Error("k8s service for app that is being cloned is missing spec.ports[0].targetPort");
		}
		await ensureServiceForApp(namespace, {
			name: newName,
			port: existingService.spec.ports[0].targetPort,
			domains: [newName],
		});
	}

	log.success(`✅ ${name} was cloned to new app named ${newName} in namespace ${namespace}`);
}
