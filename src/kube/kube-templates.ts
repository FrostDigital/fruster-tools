import { Deployment } from "../models/Deployment";

const {
	FRUSTER_LIVENESS_ANNOTATION,
	ROUTABLE_ANNOTATION,
	DOMAINS_ANNOTATION,
	CHANGE_CAUSE_ANNOTATION,
} = require("./kube-constants");
const { isSemver } = require("../utils/string-utils");

const DEFAULT_CPU_RESOURCES = "100m/1000m";
const DEFAULT_MEM_RESOURCES = "128Mi/256Mi";

export function deployment({
	namespace,
	appName,
	image,
	imageTag,
	replicas = 1,
	env = {},
	resources = { cpu: DEFAULT_CPU_RESOURCES, mem: DEFAULT_MEM_RESOURCES },
	livenessHealthCheckType = "fruster-health",
	changeCause = "",
	imagePullSecret,
}: {
	namespace: string;
	appName: string;
	image: string;
	imageTag?: string;
	replicas?: number;
	env: any;
	resources?: { cpu: string; mem: string };
	livenessHealthCheckType?: string;
	changeCause?: string;
	imagePullSecret?: string;
}): Deployment {
	const [memReq, memLimit] = (resources.mem || DEFAULT_MEM_RESOURCES).split("/");
	const [cpuReq, cpuLimit] = (resources.cpu || DEFAULT_CPU_RESOURCES).split("/");

	const livenessProbe =
		livenessHealthCheckType === "fruster-health"
			? {
					exec: {
						command: ["/bin/cat", ".health"],
					},
					failureThreshold: 3,
					initialDelaySeconds: 50,
					periodSeconds: 10,
					successThreshold: 1,
					timeoutSeconds: 50,
			  }
			: null;

	return {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: {
			name: appName,
			namespace,
			labels: {
				fruster: "true",
				app: appName,
			},
			annotations: {
				[FRUSTER_LIVENESS_ANNOTATION]: livenessHealthCheckType,
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
							env: [
								...Object.keys(env).map((key) => {
									return {
										name: key,
										valueFrom: {
											secretKeyRef: {
												key,
												name: appName + "-config",
											},
										},
									};
								}),
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

export function namespace(name: string) {
	return {
		apiVersion: "v1",
		kind: "Namespace",
		metadata: {
			name,
		},
	};
}

export function secret(namespace: string, serviceName: string, config: any) {
	Object.keys(config).forEach((key) => {
		config[key] = Buffer.from(config[key] + "").toString("base64");
	});

	return {
		apiVersion: "v1",
		data: config,
		kind: "Secret",
		metadata: {
			labels: {
				app: serviceName,
				fruster: "true",
			},
			name: serviceName + "-config",
			namespace,
		},
		type: "Opaque",
	};
}

export function service(namespace: string, serviceName: string, targetPort: number | string, domains: string[]) {
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
