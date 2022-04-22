import k8s from "@kubernetes/client-node";
import { ConfigMap } from "../models/ConfigMap";
import { Secret } from "../models/Secret";
import { Service } from "../models/Service";
import { base64encode } from "../utils";
import { CHANGE_CAUSE_ANNOTATION, DOMAINS_ANNOTATION, ROUTABLE_ANNOTATION } from "./kube-constants";
import { parseProbeString } from "../utils/kube-utils";

const { isSemver } = require("../utils/string-utils");

const DEFAULT_CPU_RESOURCES = "100m/500m";
const DEFAULT_MEM_RESOURCES = "128Mi/256Mi";

export const GLOBAL_SECRETS_NAME = "fctl-global-secrets";
export const GLOBAL_CONFIG_NAME = "fctl-global-config";

export function deployment({
	namespace,
	appName,
	image,
	imageTag,
	replicas = 1,
	env,
	resources = { cpu: DEFAULT_CPU_RESOURCES, mem: DEFAULT_MEM_RESOURCES },
	livenessHealthCheck,
	changeCause = "",
	imagePullSecret,
}: {
	namespace: string;
	appName: string;
	image: string;
	imageTag?: string;
	replicas?: number;
	env?: { [x: string]: string };
	resources?: { cpu: string; mem: string };
	livenessHealthCheck?: string;
	changeCause?: string;
	imagePullSecret?: string;
}): k8s.V1Deployment {
	const [memReq, memLimit] = (resources.mem || DEFAULT_MEM_RESOURCES).split("/");
	const [cpuReq, cpuLimit] = (resources.cpu || DEFAULT_CPU_RESOURCES).split("/");

	const livenessProbe: k8s.V1Probe | undefined = livenessHealthCheck
		? parseProbeString(livenessHealthCheck)
		: undefined;

	const envFrom = [];

	envFrom.push({
		configMapRef: {
			name: GLOBAL_CONFIG_NAME,
		},
	});

	envFrom.push({
		secretRef: {
			name: GLOBAL_SECRETS_NAME,
		},
	});

	const envRows = [];
	if (env) {
		envRows.push(...Object.keys(env).map((k) => ({ name: k, value: env[k] + "" })));
	}

	return {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: {
			name: appName,
			namespace,
			labels: {
				fctl: "true",
				app: appName,
			},
			annotations: {
				// [FRUSTER_LIVENESS_ANNOTATION]: livenessHealthCheck,
				[CHANGE_CAUSE_ANNOTATION]: changeCause,
			},
		},
		spec: {
			replicas,
			strategy: {
				type: "RollingUpdate",
			},
			selector: {
				matchLabels: {
					app: appName,
				},
			},
			template: {
				metadata: {
					labels: {
						app: appName,
					},
					name: appName,
					namespace,
					annotations: {
						configHash: "",
					},
				},
				spec: {
					containers: [
						{
							image: image + ":" + imageTag,
							imagePullPolicy: isSemver(imageTag) ? "IfNotPresent" : "Always",
							livenessProbe,
							name: appName,
							resources: {
								limits: {
									memory: memLimit,
									cpu: cpuLimit,
								},
								requests: {
									memory: memReq,
									cpu: cpuReq,
								},
							},
							envFrom,
							env: [
								// So env var SERVICE_NAME is always present in containers
								{
									name: "SERVICE_NAME",
									value: appName,
								},
								// Same for APP_NAME, although only here for legacy reasons
								{
									name: "APP_NAME",
									value: appName,
								},
								...envRows,
							],
						},
					],
					imagePullSecrets: imagePullSecret
						? [
								{
									name: imagePullSecret,
								},
						  ]
						: [],
				},
			},
		},
	};
}

export function namespace(name: string, fctlLabel = true) {
	const labels = fctlLabel ? { fctl: "true" } : undefined;
	return {
		apiVersion: "v1",
		kind: "Namespace",
		metadata: {
			name,
			labels,
		},
	};
}

export function appConfigMap(namespace: string, serviceName: string, config: any): ConfigMap {
	return {
		apiVersion: "v1",
		data: config,
		kind: "ConfigMap",
		metadata: {
			labels: {
				app: serviceName,
				fctl: "true",
			},
			name: serviceName + "-config",
			namespace,
		},
	};
}

export function secret(namespace: string, name: string, config: any, skipBase64Encode = false): Secret {
	Object.keys(config).forEach((key) => {
		config[key] = skipBase64Encode ? config[key] + "" : base64encode(config[key] + "");
	});

	return {
		apiVersion: "v1",
		data: config,
		kind: "Secret",
		metadata: {
			labels: {
				fctl: "true",
			},
			name,
			namespace,
		},
		type: "Opaque",
	};
}

export function configMap(namespace: string, name: string, config: any): ConfigMap {
	return {
		apiVersion: "v1",
		data: config,
		kind: "ConfigMap",
		metadata: {
			labels: {
				fctl: "true",
			},
			name,
			namespace,
		},
	};
}

export function service(
	namespace: string,
	serviceName: string,
	targetPort: number | string,
	domains: string[]
): Service {
	const annotations = {
		"router.deis.io/maintenance": "False",
		"router.deis.io/ssl.enforce": "False",
	};

	if (domains) {
		// @ts-ignore
		annotations[DOMAINS_ANNOTATION] = domains.join(",");
	}

	return {
		apiVersion: "v1",
		kind: "Service",
		metadata: {
			annotations,
			labels: {
				app: serviceName,
				[ROUTABLE_ANNOTATION]: "true",
			},
			name: serviceName,
			namespace,
		},
		spec: {
			ports: [
				{
					name: "http",
					port: 80,
					protocol: "TCP",
					targetPort: Number(targetPort),
				},
			],
			selector: {
				app: serviceName,
			},
			sessionAffinity: "None",
			type: "ClusterIP",
		},
	};
}

export function deploymentScale(namespace: string, serviceName: string, replicas: number | string) {
	return {
		kind: "Scale",
		apiVersion: "apps/v1",
		metadata: {
			name: serviceName,
			namespace,
		},
		spec: { replicas: Number(replicas) },
	};
}
