import k8s from "@kubernetes/client-node";
import { objToConfigRows } from "../actions/update-config";
import { getConfigMap } from "../kube/kube-client";
import { FRUSTER_LIVENESS_ANNOTATION, REQUIRED_ENV_CONFIG } from "../kube/kube-constants";
import { GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import { Deployment } from "../models/Deployment";

export function hasFrusterHealth(deployment: Deployment) {
	return (deployment.metadata?.annotations || {})[FRUSTER_LIVENESS_ANNOTATION] === "fruster-health";
}

export function enableFrusterHealth(deployment: Deployment) {
	deployment.metadata = deployment.metadata || {};
	deployment.metadata.annotations = deployment.metadata.annotations || {};
	deployment.metadata.annotations[FRUSTER_LIVENESS_ANNOTATION] = "fruster-health";

	const livenessProbe = {
		exec: {
			command: ["/bin/cat", ".health"],
		},
		failureThreshold: 3,
		initialDelaySeconds: 50,
		periodSeconds: 10,
		successThreshold: 1,
		timeoutSeconds: 50,
	};

	const ctn = getFirstContainerOrThrow(deployment);
	ctn.livenessProbe = livenessProbe;
}

export function disableFrusterHealth(deployment: Deployment) {
	deployment.metadata = deployment.metadata || {};
	deployment.metadata.annotations = deployment.metadata.annotations || {};
	delete deployment.metadata.annotations[FRUSTER_LIVENESS_ANNOTATION];

	const ctn = getFirstContainerOrThrow(deployment);

	ctn.livenessProbe = undefined;
}

export async function getDeploymentAppConfig(
	deployment: Deployment,
	includeGlobalConfig?: boolean
): Promise<{
	requiredConfig: { name: string; value: string }[];
	config: { name: string; value: string }[];
	globalConfig?: { name: string; value: string }[];
}> {
	const ctn = getFirstContainerOrThrow(deployment);

	const existingConfig = ctn.env || [];

	let globalConfig: { name: string; value: string }[] | undefined = undefined;

	if (includeGlobalConfig) {
		const { namespace } = getNameAndNamespaceOrThrow(deployment);
		const res = await getConfigMap(namespace, GLOBAL_CONFIG_NAME);

		if (res?.data) {
			globalConfig = objToConfigRows(res.data);
		}
	}

	return {
		requiredConfig: existingConfig
			.filter((c) => REQUIRED_ENV_CONFIG.includes(c.name))
			.map((c) => ({ name: c.name, value: c.value as string })),
		config: existingConfig
			.filter((c) => !REQUIRED_ENV_CONFIG.includes(c.name))
			.map((c) => ({ name: c.name, value: c.value as string })),
		globalConfig,
	};
}

export function getDeploymentImage(deployment: Deployment) {
	const ctn = getFirstContainerOrThrow(deployment);
	return ctn.image || "";
}

export function setDeploymentImage(deployment: Deployment, image: string) {
	const ctn = getFirstContainerOrThrow(deployment);
	ctn.image = image;
	return deployment;
}

export function getDeploymentContainerEnv(deployment: Deployment) {
	const ctn = getFirstContainerOrThrow(deployment);
	return ctn.env || [];
}

export function updateDeploymentContainerEnv(deployment: Deployment, env: k8s.V1Container["env"]) {
	const ctn = getFirstContainerOrThrow(deployment);
	ctn.env = env;
}

export function updateDeploymentContainerResources(deployment: Deployment, resources: k8s.V1ResourceRequirements) {
	const ctn = getFirstContainerOrThrow(deployment);
	ctn.resources = resources;
}

export function getDeploymentContainerResources(deployment: Deployment) {
	const ctn = getFirstContainerOrThrow(deployment);
	return ctn.resources;
}

export function humanReadableResources(deployment: Deployment) {
	const resources = getDeploymentContainerResources(deployment);
	return `cpu ${resources?.requests?.cpu || "-"}/${resources?.limits?.cpu || "-"}, mem ${
		resources?.requests?.memory || "-"
	}/${resources?.limits?.memory || "-"}`;
}

export function getNameAndNamespaceOrThrow(resource: Deployment | k8s.V1Service | k8s.V1Pod) {
	const name = resource.metadata?.name;
	const namespace = resource.metadata?.namespace;

	if (!name || !namespace) {
		throw new Error("Missing name and/or namespace for: " + JSON.stringify(resource));
	}

	return { name, namespace };
}

function getFirstContainerOrThrow(deployment: Deployment) {
	if (!deployment.spec?.template.spec?.containers) {
		throw new Error("Deployment is missig spec.template.spec.containers");
	}
	return deployment.spec.template.spec.containers[0];
}
