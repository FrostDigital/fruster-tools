import * as k8s from "@kubernetes/client-node";
import * as log from "../log";
import { ClusterRole } from "../models/ClusterRole";
import { ClusterRoleBinding } from "../models/ClusterRoleBinding";
import { ConfigMap } from "../models/ConfigMap";
import { Deployment } from "../models/Deployment";
import { Service } from "../models/Service";
import { AppManifest } from "../models/ServiceRegistryModel";
import { DOMAINS_ANNOTATION } from "./kube-constants";
import { deployment, namespace, service } from "./kube-templates";

let client: k8s.CoreV1Api;
let appsClient: k8s.AppsV1Api;
let coreClient: k8s.CoreV1Api;
let rbacClient: k8s.RbacAuthorizationV1Api;

if (!process.env.CI) {
	const kc = new k8s.KubeConfig();
	kc.loadFromDefault();

	client = kc.makeApiClient(k8s.CoreV1Api);
	appsClient = kc.makeApiClient(k8s.AppsV1Api);
	coreClient = kc.makeApiClient(k8s.CoreV1Api);
	rbacClient = kc.makeApiClient(k8s.RbacAuthorizationV1Api);
} else {
	client = {} as k8s.CoreV1Api; // mock if test
	appsClient = {} as k8s.AppsV1Api; // mock if test
	coreClient = {} as k8s.CoreV1Api; // mock if test
	rbacClient = {} as k8s.RbacAuthorizationV1Api; // mock if test
}

const ROLLING_RESTART_DELAY_SEC = 10;

export const kubeClient = client;

/**
 * Creates a namespace. Returns true if created, or false if it already exists.
 */
export const createNamespace = async (name: string, dryRun = false, isAppNamespace = true) => {
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
		await client.createNamespace(namespace(name, isAppNamespace));
		log.debug(`Namespace ${name} created`);
		return true;
	} catch (err: any) {
		if (err.response.statusCode !== 409) throw err;
		log.debug(`Namespace ${name} already exists`);
		return false;
	}
};

export const getNamespace = async (name: string) => {
	try {
		const { body } = await client.readNamespace(name);
		return body;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const getNamespaces = async (): Promise<k8s.V1Namespace[]> => {
	try {
		const { body } = await client.listNamespace();
		return body.items;
	} catch (err: any) {
		throw err;
	}
};

export const getDeployment = async (namespace: string, name: string): Promise<Deployment | null> => {
	try {
		const { body } = await appsClient.readNamespacedDeployment(name, namespace);

		// TODO: Quick fix, use V1Deployment and remove Deployment model
		return body as Deployment;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const getDeployments = async (namespace?: string, app?: string): Promise<k8s.V1DeploymentList> => {
	try {
		let labelSelector = "fctl=true";

		if (app) {
			labelSelector = labelSelector += ",app=" + app;
		}

		let res;

		if (namespace) {
			res = await appsClient.listNamespacedDeployment(
				namespace,
				undefined,
				undefined,
				undefined,
				undefined,
				labelSelector
			);
		} else {
			res = await appsClient.listDeploymentForAllNamespaces(undefined, undefined, undefined, labelSelector);
		}

		return res.body;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return { items: [] };
	}
};

export const deleteNamespace = async (name: string) => {
	try {
		const { body } = await client.deleteNamespace(name);
		return body;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const deleteDeployment = async (namespace: string, name: string) => {
	try {
		const { body } = await appsClient.deleteNamespacedDeployment(name, namespace);
		return body;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
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
		replicas: existingDeployment ? existingDeployment.spec?.replicas : 1,
		resources: serviceConfig.resources,
		livenessHealthCheck: serviceConfig.livenessHealthCheck,
		changeCause: opts?.changeCause,
		imagePullSecret: serviceConfig.imagePullSecret,
		hasGlobalConfig: opts?.hasGlobalConfig,
		hasGlobalSecrets: opts?.hasGlobalSecrets,
		env: serviceConfig.env,
	});

	try {
		await appsClient.createNamespacedDeployment(namespace, deploymentManifest);
		log.debug("Created deployment");
	} catch (err: any) {
		if (err.response.statusCode !== 409) throw err;

		await appsClient.replaceNamespacedDeployment(serviceConfig.name, namespace, deploymentManifest);

		log.debug("Updated deployment");
	}
};

export const createDeployment = async (namespace: string, body: k8s.V1Deployment) => {
	try {
		await appsClient.createNamespacedDeployment(namespace, body);
		log.debug("Created deployment");
	} catch (err: any) {
		throw err;
	}
};

export const patchDeployment = async (namespace: string, deploymentName: string, patch: any) => {
	// const options = { headers: { "Content-type": "application/strategic-merge-patch+json" } };
	// const options = { headers: { "content-type": "application/json-patch+json" } };
	const options = { headers: { "content-type": "application/strategic-merge-patch+json" } };

	try {
		await appsClient.patchNamespacedDeployment(deploymentName, namespace, patch, undefined, undefined, options);
		log.debug("Patched deployment");
	} catch (err: any) {
		log.error("Failed to patch deployment " + deploymentName);
		console.log(err);
	}
};

export const updateDeployment = async (namespace: string, deploymentName: string, update: k8s.V1Deployment) => {
	const oUpdate = { ...update };

	if (oUpdate.metadata) {
		delete oUpdate.metadata.selfLink;
		delete oUpdate.metadata.resourceVersion;
		delete oUpdate.metadata.uid;
		delete oUpdate.metadata.creationTimestamp;
	}

	delete oUpdate.status;

	try {
		await appsClient.replaceNamespacedDeployment(deploymentName, namespace, oUpdate);
		log.debug("Updated deployment");
	} catch (err: any) {
		log.error("Failed to update deployment " + deploymentName);
		console.log(err);
	}
};

export const getSecret = async (namespace = "default", name: string) => {
	try {
		const { body } = await client.readNamespacedSecret(name, namespace);
		return body;
	} catch (err: any) {
		if (err.response.statusCode === 404) return null;
		throw err;
	}
};

export const updateSecret = async (namespace: string, name: string, body: k8s.V1Secret) => {
	if (body.metadata) {
		delete body.metadata.creationTimestamp;
		delete body.metadata.uid;
		delete body.metadata.resourceVersion;
	}

	try {
		await client.replaceNamespacedSecret(name, namespace, body);
		log.debug(`Updated secret ${name} in namespace ${namespace}`);
	} catch (err: any) {
		console.error("Failed to update secret", err);
	}
};

export const createSecret = async (namespace: string, secret: k8s.V1Secret) => {
	secret.metadata = secret.metadata || {};
	secret.metadata.namespace = namespace;

	try {
		const res = await client.createNamespacedSecret(namespace, secret);
		log.debug(`Created secret for ${namespace}`);
		return res.body;
	} catch (err: any) {
		if (err.response.statusCode !== 409) throw err;

		await client.replaceNamespacedSecret(secret.metadata.name!, namespace, secret);

		log.debug(`Updated config for ${namespace}`);
	}
};

export const deleteSecret = async (namespace: string, secretName: string) => {
	try {
		await client.deleteNamespacedSecret(secretName, namespace);
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
	}
};

export const getConfigMap = async (namespace: string, name: string): Promise<k8s.V1ConfigMap | null> => {
	try {
		const { body } = await coreClient.readNamespacedConfigMap(name, namespace);
		return body;
	} catch (err: any) {
		if (err.response.statusCode === 404) return null;
		throw err;
	}
};

export const createConfigMap = async (namespace: string, configMap: ConfigMap): Promise<k8s.V1ConfigMap | null> => {
	try {
		const { body } = await coreClient.createNamespacedConfigMap(namespace, configMap);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const updateConfigMap = async (
	namespace: string,
	name: string,
	configMap: k8s.V1ConfigMap
): Promise<k8s.V1ConfigMap | null> => {
	if (configMap.metadata) {
		delete configMap.metadata.selfLink;
		delete configMap.metadata.resourceVersion;
		delete configMap.metadata.uid;
		delete configMap.metadata.creationTimestamp;
	}

	try {
		const { body } = await coreClient.replaceNamespacedConfigMap(name, namespace, configMap);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const createService = async (namespace: string, body: Service) => {
	try {
		await client.createNamespacedService(namespace, body);
		return true;
	} catch (err: any) {
		if (err.response.statusCode !== 409) throw err;
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
		await client.createNamespacedService(namespace, service(namespace, name, port, domains));
		log.debug(`Service created`);
		return true;
	} catch (err: any) {
		if (err.response.statusCode !== 409) throw err;
		log.debug(`Service already exists`);

		const existingService = await getService(namespace, name);
		const existingDomains = (existingService?.metadata?.annotations || {})[DOMAINS_ANNOTATION];

		if (existingService && existingDomains !== domains.join(",")) {
			existingService.metadata = existingService.metadata || {};
			existingService.metadata.annotations = existingService.metadata.annotations || {
				"router.deis.io/maintenance": "False",
				"router.deis.io/ssl.enforce": "False",
			};

			existingService.metadata.annotations[DOMAINS_ANNOTATION] = domains.join(",");

			delete existingService.metadata.selfLink;
			// delete existingService.metadata.resourceVersion;
			delete existingService.metadata.uid;
			delete existingService.metadata.creationTimestamp;
			delete existingService.status;

			await client.replaceNamespacedService(name, namespace, existingService);
		}

		return false;
	}
};

export const getService = async (namespace: string, name: string): Promise<k8s.V1Service | null> => {
	try {
		const { body } = await client.readNamespacedService(name, namespace);
		return body;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const deleteService = async (namespace: string, name: string) => {
	try {
		await client.deleteNamespacedService(name, namespace);
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

export const getReplicaSets = async (namespace: string, serviceName?: string): Promise<any[] | null> => {
	try {
		const { body } = await appsClient.listNamespacedReplicaSet(
			namespace,
			undefined,
			undefined,
			undefined,
			undefined,
			"app=" + serviceName
		);

		return body.items;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const deleteReplicaSet = async (namespace: string, serviceName: string) => {
	try {
		const rs = await appsClient.listNamespacedReplicaSet(
			namespace,
			undefined,
			undefined,
			undefined,
			undefined,
			`app=${serviceName}`
		);

		for (const item of rs.body.items) {
			if (item.metadata?.name) {
				await appsClient.deleteNamespacedReplicaSet(item.metadata.name, namespace);
			}
		}

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

	imagePullSecret.data = imagePullSecret.data || {};

	const existingPulllSecret = await getSecret(secretName, toNamespace);
	if (
		existingPulllSecret &&
		existingPulllSecret.data &&
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
export const getPods = async (namespace: string, appName: string) => {
	try {
		let res;

		const labelSelector = "app=" + appName;

		if (namespace) {
			res = await client.listNamespacedPod(namespace, undefined, undefined, undefined, undefined, labelSelector);
		} else {
			res = await client.listPodForAllNamespaces(undefined, undefined, undefined, labelSelector);
		}

		return res.body.items;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return [];
	}
};

export const scaleDeployment = async (namespace: string, appName: string, replicas: number) => {
	try {
		await patchDeployment(namespace, appName, {
			spec: {
				replicas,
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
		await client.deleteNamespacedPod(podName, namespace);
		return true;
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
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
			const stream = await client.readNamespacedPodLog(podName, namespace, undefined, true);

			return stream;
		} else {
			const { body } = await client.readNamespacedPodLog(
				podName,
				namespace,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				undefined,
				tailLines
			);

			return body;
		}
	} catch (err: any) {
		console.log(err);
	}
};

export const getSecrets = async (namespace?: string): Promise<k8s.V1Secret[] | null> => {
	try {
		if (namespace) {
			const { body } = await client.listNamespacedSecret(namespace);
			return body.items;
		} else {
			const { body } = await client.listSecretForAllNamespaces();
			return body.items;
		}
	} catch (err: any) {
		if (err.response.statusCode !== 404) throw err;
		return null;
	}
};

export const getClusterRole = async (name: string): Promise<k8s.V1ClusterRole | null> => {
	try {
		const { body } = await rbacClient.readClusterRole(name);
		return body;
	} catch (err: any) {
		if (err.response.statusCode === 404) return null;
		throw err;
	}
};

export const deleteClusterRole = async (name: string) => {
	try {
		await rbacClient.deleteClusterRole(name);
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

export const getClusterRoleBinding = async (name: string): Promise<k8s.V1ClusterRoleBinding | null> => {
	try {
		const { body } = await rbacClient.readClusterRoleBinding(name);
		return body;
	} catch (err: any) {
		if (err.response.statusCode === 404) return null;

		throw err;
	}
};

export const deleteClusterRoleBinding = async (name: string): Promise<boolean> => {
	try {
		await rbacClient.deleteClusterRoleBinding(name);
		return true;
	} catch (err: any) {
		if (err.response.statusCode === 404) return true;
		return false;
	}
};

export const createClusterRole = async (clusterRole: ClusterRole): Promise<k8s.V1ClusterRole> => {
	try {
		const { body } = await rbacClient.createClusterRole(clusterRole);
		return body;
	} catch (err: any) {
		console.log(err);
		throw err;
	}
};

export const createClusterRoleBinding = async (
	clusterRoleBinding: ClusterRoleBinding
): Promise<k8s.V1ClusterRoleBinding> => {
	try {
		const { body } = await rbacClient.createClusterRoleBinding(clusterRoleBinding);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const createRole = async (namespace: string, role: k8s.V1Role): Promise<k8s.V1Role> => {
	try {
		const { body } = await rbacClient.createNamespacedRole(namespace, role);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const deleteRole = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await rbacClient.deleteNamespacedRole(name, namespace);
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			return true;
		}

		return false;
	}
};

export const createRoleBinding = async (namespace: string, roleBinding: k8s.V1RoleBinding) => {
	try {
		const { body } = await rbacClient.createNamespacedRoleBinding(namespace, roleBinding);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export const deleteRoleBinding = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await rbacClient.deleteNamespacedRoleBinding(name, namespace);
		return true;
	} catch (err: any) {
		if (err.statusCode === 404) {
			return true;
		}

		return false;
	}
};

export const getServiceAccount = async (namespace: string, name: string) => {
	try {
		const { body } = await client.readNamespacedServiceAccount(name, namespace);
		return body;
	} catch (err: any) {
		if (err.response.statusCode === 404) return null;
		throw err;
	}
};

export const deleteServiceAccount = async (namespace: string, name: string): Promise<boolean> => {
	try {
		await client.deleteNamespacedServiceAccount(name, namespace);
		return true;
	} catch (err: any) {
		if (err.response.statusCode === 404) return true;
		return false;
	}
};

export const createServiceAccount = async (namespace: string, serviceAccount: k8s.V1ServiceAccount) => {
	try {
		const { body } = await client.createNamespacedServiceAccount(namespace, serviceAccount);
		return body;
	} catch (err: any) {
		throw err;
	}
};

export function getConfigNameFromServiceName(serviceName: string) {
	return serviceName + "-config";
}

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
