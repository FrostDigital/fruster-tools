import k8s, { V1Probe } from "@kubernetes/client-node";
import { objToConfigRows } from "../actions/update-config";
import { getConfigMap } from "../kube/kube-client";
import { REQUIRED_ENV_CONFIG } from "../kube/kube-constants";
import { GLOBAL_CONFIG_NAME } from "../kube/kube-templates";
import { Deployment } from "../models/Deployment";
import * as log from "../log";

export function setProbe(probeString: string, deployment: Deployment, type: "liveness" | "readiness") {
	deployment.metadata = deployment.metadata || {};
	deployment.metadata.annotations = deployment.metadata.annotations || {};

	const probe = parseProbeString(probeString);

	const ctn = getFirstContainerOrThrow(deployment);

	if (type === "liveness") {
		ctn.livenessProbe = probe;
	} else if (type === "readiness") {
		ctn.readinessProbe = probe;
	}
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

// Parses port and path from string like :8080/foo/bar
const httpGetRegex = /:(\d.*?)(\/.*)/;

const defaultProbeOptions: Partial<k8s.V1Probe> = {
	failureThreshold: 3,
	periodSeconds: 10,
	successThreshold: 1,
	timeoutSeconds: 50,
};

export function parseProbeString(hc: string): k8s.V1Probe | undefined {
	hc = hc.toLowerCase();

	const [probe, initialDelaySplit] = hc.split(";");

	let initialDelaySeconds = 30;

	if (initialDelaySplit && initialDelaySplit.includes("initialdelayseconds=")) {
		initialDelaySeconds = parseInt(initialDelaySplit.replace("initialdelayseconds=", ""));
	}

	if (probe.includes("tcp=")) {
		const port = probe.replace("tcp=", "");

		return {
			tcpSocket: {
				port,
			},
			...defaultProbeOptions,
			initialDelaySeconds,
		};
	}

	if (probe.includes("exec=")) {
		const command = probe.replace("exec=", "");

		return {
			exec: {
				command: command.split(" "), // TODO: Handle quotes
			},
			...defaultProbeOptions,
			initialDelaySeconds,
		};
	}

	if (probe.includes("get=")) {
		const httpGet = probe.replace("get=", "");

		const res = httpGetRegex.exec(httpGet);

		if (!res) {
			log.warn(`Invalid httpGet health check '${httpGet}' expected something like :8080/healthz`);
			return;
		}

		const [_, port, path] = res;

		return {
			httpGet: {
				port,
				path,
			},
			...defaultProbeOptions,
			initialDelaySeconds,
		};
	}

	return undefined;
}

export function getProbeString(deployment: Deployment, type: "liveness" | "readiness") {
	const ctn = getFirstContainerOrThrow(deployment);

	let probe: V1Probe | undefined = undefined;

	if (type === "liveness") {
		probe = ctn.livenessProbe;
	} else if (type === "readiness") {
		probe = ctn.readinessProbe;
	} else {
		throw new Error("Should not happen?!");
	}

	if (!probe) {
		return "";
	}

	const initialDelay = ";initialDelaySeconds=" + probe.initialDelaySeconds;

	if (probe.exec) {
		return `exec=${(probe.exec.command || []).join(" ")}${initialDelay}`;
	} else if (probe.httpGet) {
		return `get=:${probe.httpGet.port}/${probe.httpGet.path}${initialDelay}`;
	} else if (probe.tcpSocket) {
		return `tcp=:${probe.tcpSocket.port}${initialDelay}`;
	}
}

export function getFirstContainerOrThrow(deployment: Deployment) {
	if (!deployment.spec?.template.spec?.containers) {
		throw new Error("Deployment is missing spec.template.spec.containers");
	}
	return deployment.spec.template.spec.containers[0];
}
