import { ApiClient, ApiRoot, Client1_13 } from "kubernetes-client";
import { kubeClientVersion } from "../conf";
import { deployment, namespace, appConfigMap, service } from "./kube-templates";
import * as log from "../log";
import { AppManifest } from "../models/ServiceRegistryModel";
import { Namespace } from "../models/Namespace";
import { ClusterRole } from "../models/ClusterRole";
import { ClusterRoleBinding } from "../models/ClusterRoleBinding";
import { ServiceAccount } from "../models/ServiceAccount";
import { Deployment } from "../models/Deployment";
import { Secret } from "../models/Secret";
import { Service } from "../models/Service";
import { DOMAINS_ANNOTATION } from "./kube-constants";
import { ConfigMap } from "../models/ConfigMap";

const REQ_TIMEOUT = 20 * 1000;
const Request = require("kubernetes-client/backends/request");

let client: ApiRoot;

if (!process.env.CI) {
	client = new Client1_13({
		backend: new Request({ ...Request.config.fromKubeconfig(), timeout: REQ_TIMEOUT }),
		version: kubeClientVersion,
	});
} else {
	client = {} as ApiRoot; // mock if test
}

const ROLLING_RESTART_DELAY_SEC = 10;

export const kubeClient = client;

/**
 * Creates a namespace. Returns true if created, or false if it already exists.
 */
export const createNamespace = async (name: string, dryRun = false) => {
	if (dryRun) {
		if (await getNamespace(name)) {
			log.info(`[Dry run] Namespace ${name} already exists`);
			return false;
		} else {
			log.info(`[Dry run] Namespace ${name} will be created`);
			return true;
		}
	}

	try {
		await client.api.v1.namespaces.post({ body: namespace(name) });
		log.debug(`Namespace ${name} created`);
		return true;
	} catch (err: any) {
		if (err.code !== 409) throw err;
		log.debug(`Namespace ${name} already exists`);
		return false;
	}
};

export const getNamespace = async (name: string) => {
	try {
		const { body } = await client.api.v1.namespaces(name).get();
		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getDeployment = async (namespace: string, name: string): Promise<Deployment | null> => {
	try {
		const { body } = await client.apis.apps.v1.namespaces(namespace).deployments(name).get();

		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getDeployments = async (namespace?: string, app?: string): Promise<{ items: Deployment[] }> => {
	try {
		const qs = { qs: { labelSelector: "fruster=true" } };

		if (app) {
			qs.qs.labelSelector += ",app=" + app;
		}

		let res;

		if (namespace) {
			res = await client.apis.apps.v1.namespaces(namespace).deployments.get(qs);
		} else {
			res = await client.apis.apps.v1.deployments.get(qs);
		}

		return res.body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return { items: [] };
	}
};

export const deleteNamespace = async (name: string) => {
	try {
		const { body } = await client.api.v1.namespace(name).delete();
		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const deleteDeployment = async (namespace: string, name: string) => {
	try {
		const { body } = await client.apis.apps.v1.namespaces(namespace).deployments(name).delete();
		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const createAppDeployment = async (
	namespace: string,
	serviceConfig: AppManifest,
	opts?: { changeCause: string; hasGlobalConfig?: boolean; hasGlobalSecrets?: boolean }
) => {
	const existingDeployment = await getDeployment(namespace, serviceConfig.name);

	if (!serviceConfig.image) {
		throw new Error("Missing image");
	}

	const deploymentManifest = deployment({
		namespace,
		appName: serviceConfig.name,
		image: serviceConfig.image,
		imageTag: serviceConfig.imageTag,
		// Use existing number of replicas in update of deployment
		replicas: existingDeployment ? existingDeployment.spec.replicas : 1,
		resources: serviceConfig.resources,
		livenessHealthCheckType: serviceConfig.livenessHealthCheck,
		changeCause: opts?.changeCause,
		imagePullSecret: serviceConfig.imagePullSecret,
		hasGlobalConfig: opts?.hasGlobalConfig,
		hasGlobalSecrets: opts?.hasGlobalSecrets,
		env: serviceConfig.env,
	});

	try {
		await client.apis.apps.v1.namespace(namespace).deployments.post({ body: deploymentManifest });
		log.debug("Created deployment");
	} catch (err: any) {
		if (err.code !== 409) throw err;

		await client.apis.apps.v1
			.namespaces(namespace)
			.deployments(serviceConfig.name)
			.put({ body: deploymentManifest });

		log.debug("Updated deployment");
	}
};

export const createDeployment = async (namespace: string, body: Deployment) => {
	try {
		await client.apis.apps.v1.namespace(namespace).deployments.post({ body });
		log.debug("Created deployment");
	} catch (err: any) {
		throw err;
	}
};

export const patchDeployment = async (namespace: string, deploymentName: string, patch: any) => {
	try {
		await client.apis.apps.v1.namespace(namespace).deployments(deploymentName).patch(patch);
		log.debug("Patched deployment");
	} catch (err: any) {
		log.error("Failed to patch deployment " + deploymentName);
		console.log(err);
	}
};

export const updateDeployment = async (namespace: string, deploymentName: string, update: Deployment) => {
	delete update.metadata.selfLink;
	delete update.metadata.resourceVersion;
	delete update.metadata.uid;
	delete update.metadata.creationTimestamp;

	try {
		await client.apis.apps.v1.namespace(namespace).deployments(deploymentName).put({ body: update });
		log.debug("Updated deployment");
	} catch (err: any) {
		log.error("Failed to update deployment " + deploymentName);
		console.log(err);
	}
};

export const getSecret = async (namespace = "default", name: string): Promise<Secret | null> => {
	try {
		const { body } = await client.api.v1.namespaces(namespace).secret(name).get();
		return body;
	} catch (err: any) {
		if (err.code === 404) return null;
		throw err;
	}
};

export const updateSecret = async (namespace: string, name: string, body: Secret) => {
	try {
		await client.api.v1.namespace(namespace).secret(name).put({ body });
		log.debug(`Updated secret ${name} in namespace ${namespace}`);
	} catch (err: any) {
		console.error("Failed to update secret", err);
	}
};

// export const getConfig = async (namespace: string, serviceName: string): Promise<{ [x: string]: string } | null> => {
// 	try {
// 		const { body } = await client.api.v1
// 			.namespace(namespace)
// 			.secret(getConfigNameFromServiceName(serviceName))
// 			.get();

// 		if (body.data) {
// 			Object.keys(body.data).forEach((key) => {
// 				body.data[key] = base64Decode(body.data[key]);
// 			});
// 		}

// 		return body.data || {};
// 	} catch (err: any) {
// 		if (err.code !== 404) throw err;
// 		return null;
// 	}
// };

export const createSecret = async (namespace: string, secret: Secret) => {
	secret.metadata.namespace = namespace;

	try {
		await client.api.v1.namespaces(namespace).secrets.post({ body: secret });
		log.debug(`Created secret for ${namespace}`);
	} catch (err: any) {
		if (err.code !== 409) throw err;

		await client.api.v1.namespace(namespace).secret(secret.metadata.name).put({ body: secret });

		log.debug(`Updated config for ${namespace}`);
	}
};

export const deleteSecret = async (namespace: string, secretName: string) => {
	try {
		await client.api.v1.namespaces(namespace).secrets(secretName).delete();
	} catch (err: any) {
		if (err.code !== 404) throw err;
	}
};

export const getConfigMap = async (namespace: string, name: string): Promise<ConfigMap | null> => {
	try {
		const { body } = await client.api.v1.namespaces(namespace).configmap(name).get();
		return body;
	} catch (err: any) {
		if (err.code === 404) return null;
		throw err;
	}
};

export const createConfigMap = async (namespace: string, configMap: ConfigMap): Promise<ConfigMap | null> => {
	try {
		const { body } = await client.api.v1.namespaces(namespace).configmap.post({ body: configMap });
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const updateConfigMap = async (
	namespace: string,
	name: string,
	configMap: ConfigMap
): Promise<ConfigMap | null> => {
	try {
		const { body } = await client.api.v1.namespaces(namespace).configmap(name).put({ body: configMap });
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const createService = async (namespace: string, body: Service) => {
	try {
		await client.api.v1.namespace(namespace).service.post({ body });
		return true;
	} catch (err: any) {
		if (err.code !== 409) throw err;
		return false;
	}
};

export const ensureServiceForApp = async (
	namespace: string,
	{ name, port, domains = [] }: { name: string; port: string | number; domains?: string[] }
) => {
	// Name of service is mandatory as domain
	if (!domains.includes(name)) domains.push(name);

	if (!port) {
		log.error(`Missing PORT in env for ${name} which is needed for routable apps`);
		throw new Error("Missing PORT");
	}

	try {
		await client.api.v1.namespace(namespace).service.post({ body: service(namespace, name, port, domains) });
		log.debug(`Service created`);
		return true;
	} catch (err: any) {
		if (err.code !== 409) throw err;
		log.debug(`Service already exists`);

		const existingService = await getService(namespace, name);
		const existingDomains = (existingService?.metadata.annotations || {})[DOMAINS_ANNOTATION];

		if (existingService && existingDomains !== domains.join(",")) {
			existingService.metadata.annotations = existingService.metadata.annotations || {
				"router.deis.io/maintenance": "False",
				"router.deis.io/ssl.enforce": "False",
			};

			existingService.metadata.annotations[DOMAINS_ANNOTATION] = domains.join(",");

			await client.api.v1.namespace(namespace).service(name).put({ body: existingService });
		}

		return false;
	}
};

export const getService = async (namespace: string, name: string): Promise<Service | null> => {
	try {
		const { body } = await client.api.v1.namespace(namespace).service(name).get();
		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const deleteService = async (namespace: string, name: string) => {
	try {
		await client.api.v1.namespace(namespace).service(name).delete();
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			log.debug(
				`Failed to delete k8s service '${name}' (namespace '${namespace}'), kubernetes indicates that service is already removed or has never existed`
			);
		} else {
			log.debug("Failed deleting service: " + name);
		}

		return false;
	}
};

export const deleteReplicaSet = async (namespace: string, serviceName: string) => {
	try {
		const query = { qs: { labelSelector: "app=" + serviceName } };
		await client.apis.app.v1.namespace(namespace).replicaset.get(query).delete();
		return true;
	} catch (err: any) {
		log.debug("Failed deleting replicaset: " + serviceName);
		return false;
	}
};

export const copySecret = async (secretName: string, fromNamespace: string, toNamespace: string) => {
	// image pull secret is needed if image is hosted in private registry
	// the strategy is that the secret must already exist in the default namespace
	// and this will copied to a secret in the services namespace
	const imagePullSecret = await getSecret(secretName, fromNamespace);

	if (!imagePullSecret) {
		log.error(
			`Image pull secret named ${secretName} does not exist in default namespace.\nFollow documentation here to create secret https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/`
		);
		return false;
	}

	const existingPulllSecret = await getSecret(secretName, toNamespace);
	if (
		existingPulllSecret &&
		existingPulllSecret.data[".dockerconfigjson"] === imagePullSecret.data[".dockerconfigjson"]
	) {
		log.debug("Sercet already exists, nothing to do ");
		return true;
	}

	// duplicate image pull secret so it exists in services namespace
	await createSecret(toNamespace, {
		...imagePullSecret,
		metadata: { name: secretName, namespace: toNamespace },
	});

	return true;
};

export const restartPods = async (namespace: string, appName: string, rollingRestart: boolean) => {
	try {
		const pods = filterNonTerminatedPods(await getPods(namespace, appName));

		if (rollingRestart) {
			if (pods && pods.length > 1) {
				log.warn("Performing rolling restart - do not interrupt this script while loading!");

				let i = 0;
				for (const pod of pods) {
					i++;
					log.info(
						`Rolling restart ${i}/${pods.length} (delay ${ROLLING_RESTART_DELAY_SEC}s in between restarts)`
					);
					const restartRes = await deletePod(namespace, pod.metadata.name);

					if (restartRes) {
						await sleep(ROLLING_RESTART_DELAY_SEC * 1000);
					} else {
						log.debug("Failed to restart pod " + pod.metadata.name);
					}
				}

				return true;
			} else {
				log.debug("Not enough pods to do rolling restart");
			}
		}

		for (const pod of pods) {
			await deletePod(namespace, pod.metadata.name);
		}
		return true;
	} catch (err: any) {
		log.warn("Failed restarting pod(s), is service deployed yet?");
		console.log(err);
		return false;
	}
};

/**
 * @param {string?} namespace
 * @param {string?} appName
 */
export const getPods = async (namespace: string, appName: string): Promise<any[]> => {
	try {
		const query = appName ? { qs: { labelSelector: "app=" + appName } } : {};
		let res;

		if (namespace) {
			res = await client.api.v1.namespace(namespace).pods.get(query);
		} else {
			res = await client.api.v1.pods.get(query);
		}

		return res.body.items;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return [];
	}
};

export const scaleDeployment = async (namespace: string, serviceName: string, replicas: number) => {
	try {
		await patchDeployment(namespace, serviceName, {
			body: {
				spec: {
					replicas,
				},
			},
		});
		return true;
	} catch (err: any) {
		console.log(err);
		return false;
	}
};

export const deletePod = async (namespace: string, podName: string) => {
	try {
		await client.api.v1.namespace(namespace).pod(podName).delete();
		return true;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return false;
	}
};

export const getNamespaceForApp = async (appName: string) => {
	const deployments = await getDeployments(undefined, appName);

	if (deployments.items.length) {
		return deployments.items.map((item: any) => item.metadata.namespace);
	} else {
		return [];
	}
};

export const getLogs = async (namespace: string, podName: string, tailLines = 100, streamLogs = false) => {
	try {
		if (streamLogs) {
			const stream = await client.api.v1.namespace(namespace).po(podName).log.getStream();

			return stream;
		} else {
			const { body } = await client.api.v1.namespace(namespace).po(podName).log.get({ qs: { tailLines } });

			return body;
		}
	} catch (err: any) {
		console.log(err);
	}
};

export const getReplicaSets = async (namespace: string, serviceName?: string): Promise<any[] | null> => {
	try {
		const query = serviceName ? { qs: { labelSelector: "app=" + serviceName } } : {};
		const { body } = await client.apis.apps.v1.namespace(namespace).replicasets.get(query);

		return body.items;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getSecrets = async (namespace?: string): Promise<any[] | null> => {
	try {
		if (namespace) {
			const { body } = await client.api.v1.namespace(namespace).secrets.get({});
			return body.items;
		} else {
			const { body } = await client.api.v1.secrets.get({});
			return body.items;
		}
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getNamespaces = async (): Promise<Namespace[]> => {
	try {
		const { body } = await client.api.v1.namespaces.get();
		return body.items;
	} catch (err: any) {
		throw err;
	}
};

export const getClusterRole = async (name: string): Promise<ClusterRole | null> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1.clusterrole(name).get();
		return body;
	} catch (err: any) {
		if (err.code === 404) return null;
		throw err;
	}
};

export const deleteClusterRole = async (name: string) => {
	try {
		await client.apis["rbac.authorization.k8s.io"].v1.clusterrole(name).delete();
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			log.debug(
				`Failed to delete k8s service '${name}' (namespace '${namespace}'), kubernetes indicates that service is already removed or has never existed`
			);
		} else {
			log.debug("Failed deleting service: " + name);
		}

		return false;
	}
};

export const getClusterRoleBinding = async (name: string): Promise<ClusterRoleBinding | null> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1.clusterrolebinding(name).get();
		return body;
	} catch (err: any) {
		if (err.code === 404) return null;

		throw err;
	}
};

export const deleteClusterRoleBinding = async (name: string): Promise<boolean> => {
	try {
		await client.apis["rbac.authorization.k8s.io"].v1.clusterrolebinding(name).delete();
		return true;
	} catch (err: any) {
		if (err.code === 404) return true;
		return false;
	}
};

export const createClusterRole = async (clusterRole: ClusterRole): Promise<ClusterRole> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1.clusterrole.post({ body: clusterRole });
		return body;
	} catch (err: any) {
		console.log(err);
		throw err;
	}
};

export const createClusterRoleBinding = async (clusterRoleBinding: ClusterRoleBinding): Promise<any> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1.clusterrolebinding.post({
			body: clusterRoleBinding,
		});
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const createRole = async (namespace: string, role: any): Promise<boolean> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1
			.namespace(namespace)
			.role.post({ body: role });
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const deleteRole = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await client.apis["rbac.authorization.k8s.io"].v1.namespace(namespace).role(name).delete();
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			return true;
		}

		return false;
	}
};

export const createRoleBinding = async (namespace: string, roleBinding: any): Promise<any> => {
	try {
		const { body } = await client.apis["rbac.authorization.k8s.io"].v1
			.namespace(namespace)
			.rolebinding.post({ body: roleBinding });
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const deleteRoleBinding = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await client.apis["rbac.authorization.k8s.io"].v1.namespace(namespace).rolebinding(name).delete();
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			return true;
		}

		return false;
	}
};

export const getServiceAccount = async (namespace: string, name: string): Promise<ServiceAccount | null> => {
	try {
		const { body } = await client.api.v1.namespace(namespace).serviceaccount(name).get();
		return body;
	} catch (err: any) {
		if (err.code === 404) return null;
		throw err;
	}
};

export const deleteServiceAccount = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await client.api.v1.namespace(namespace).serviceaccount(name).delete();
		return true;
	} catch (err: any) {
		if (err.code === 404) return true;
		return false;
	}
};

export const createServiceAccount = async (namespace: string, serviceAccount: ServiceAccount): Promise<any> => {
	try {
		const { body } = await client.api.v1.namespace(namespace).serviceaccount.post({ body: serviceAccount });
		return body;
	} catch (err: any) {
		throw err;
	}
};

/**
 *
 * @param {string} serviceName
 */
export function getConfigNameFromServiceName(serviceName: string) {
	return serviceName + "-config";
}

/**
 *
 * @param {string} str
 */
function base64Decode(str: string) {
	return Buffer.from(str, "base64").toString();
}

/**
 *
 * @param {number} ms
 */
function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function filterNonTerminatedPods(pods: any[]) {
	return pods.filter((pod) => {
		return pod.status.containerStatuses && !pod.status.containerStatuses[0]?.state.terminated;
	});
}

// export async function getClusterInfo() {
// 	const conf = config.fromKubeconfig();

// 	return {
// 		clusterUrl: conf.url,
// 	};
// }
