import { Deployment } from "../models/Deployment";
import { FRUSTER_LIVENESS_ANNOTATION, REQUIRED_ENV_CONFIG } from "../kube/kube-constants";

export function hasFrusterHealth(deployment: Deployment) {
	return (deployment.metadata.annotations || {})[FRUSTER_LIVENESS_ANNOTATION] === "fruster-health";
}

export function enableFrusterHealth(deployment: Deployment) {
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

	deployment.spec.template.spec.containers[0].livenessProbe = livenessProbe;
}

export function disableFrusterHealth(deployment: Deployment) {
	deployment.metadata.annotations = deployment.metadata.annotations || {};
	delete deployment.metadata.annotations[FRUSTER_LIVENESS_ANNOTATION];

	deployment.spec.template.spec.containers[0].livenessProbe = undefined;
}

export function getDeploymentAppConfig(deployment: Deployment): {
	requiredConfig: { name: string; value: string }[];
	config: { name: string; value: string }[];
} {
	const existingConfig = deployment.spec.template.spec.containers[0].env || [];

	return {
		requiredConfig: existingConfig
			.filter((c) => REQUIRED_ENV_CONFIG.includes(c.name))
			.map((c) => ({ name: c.name, value: c.value as string })),
		config: existingConfig
			.filter((c) => !REQUIRED_ENV_CONFIG.includes(c.name))
			.map((c) => ({ name: c.name, value: c.value as string })),
	};
}

export function getDeploymentImage(deployment: Deployment) {
	const [container] = deployment.spec.template.spec.containers || [];

	if (container) {
		return container.image;
	}

	return "";
}

export function setDeploymentImage(deployment: Deployment, image: string) {
	deployment.spec.template.spec.containers[0].image = image;
	return deployment;
}
