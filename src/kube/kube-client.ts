import { Client1_13 } from "kubernetes-client";
import { kubeClientVersion } from "../conf";
import { deployment, namespace, secret, service, deploymentScale } from "./kube-templates";
import * as log from "../log";
import { ServiceRegistryService } from "../models/ServiceRegistryModel";

const client = new Client1_13({ version: kubeClientVersion });

const ROLLING_RESTART_DELAY_SEC = 10;

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

const getNamespace = async (name: string) => {
	try {
		const { body } = await client.api.v1.namespaces(name).get();
		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getDeployment = async (namespace: string, name: string) => {
	try {
		const { body } = await client.apis.apps.v1.namespaces(namespace).deployments(name).get();

		return body;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const getDeployments = async (namespace?: string, app?: string) => {
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

export const createDeployment = async (
	namespace: string,
	serviceConfig: ServiceRegistryService,
	changeCause: string,
	imagePullSecret?: string
) => {
	const existingDeployment = await getDeployment(namespace, serviceConfig.name);

	if (!serviceConfig.image) {
		throw new Error("Missing image");
	}

	const deploymentManifest = deployment({
		namespace,
		appName: serviceConfig.name,
		image: serviceConfig.image, //+ ":" + (serviceConfig.imageTag || "latest"),
		imageTag: serviceConfig.imageTag,
		// Use existing number of replicas in update of deployment
		replicas: existingDeployment ? existingDeployment.spec.replicas : 1,
		env: serviceConfig.env,
		resources: serviceConfig.resources,
		livenessHealthCheckType: serviceConfig.livenessHealthCheck,
		changeCause,
		imagePullSecret,
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

export const patchDeployment = async (namespace: string, deploymentName: string, patch: any) => {
	try {
		await client.apis.apps.v1.namespace(namespace).deployments(deploymentName).patch(patch);
		log.debug("Patched deployment");
	} catch (err: any) {
		log.error("Failed to patch deployment " + deploymentName);
		console.log(err);
	}
};

export const getSecret = async (name: string, namespace = "default") => {
	try {
		const { body } = await client.api.v1.namespaces(namespace).secret(name).get();
		return body;
	} catch (err: any) {
		return null;
	}
};

export const setConfig = async (namespace: string, serviceName: string, env: any) => {
	const newSecret = secret(namespace, serviceName, { ...(env || {}) });

	try {
		await client.api.v1.namespaces(namespace).secrets.post({ body: newSecret });
		log.debug(`Created config for ${serviceName}`);
	} catch (err: any) {
		if (err.code !== 409) throw err;

		await client.api.v1.namespace(namespace).secret(newSecret.metadata.name).put({ body: newSecret });

		log.debug(`Updated config for ${serviceName}`);
	}
};

export const getConfig = async (namespace: string, serviceName: string) => {
	try {
		const { body } = await client.api.v1
			.namespace(namespace)
			.secret(getConfigNameFromServiceName(serviceName))
			.get();

		if (body.data) {
			Object.keys(body.data).forEach((key) => {
				body.data[key] = base64Decode(body.data[key]);
			});
		}

		return body.data;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

export const createSecret = async (namespace: string, secret: any) => {
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

export const createService = async (
	namespace: string,
	{ name, env, domains = [] }: { name: string; env: any; domains?: string[] }
) => {
	if (!domains.includes(name)) domains.push(name);

	const port = env.PORT;

	if (!port) {
		log.error(`Missing PORT in env for ${name} which is needed for routable apps`);
		process.exit(1);
	}

	try {
		await client.api.v1.namespace(namespace).service.post({ body: service(namespace, name, port, domains) });
		log.debug(`Service created`);
		return true;
	} catch (err: any) {
		if (err.code !== 409) throw err;
		log.debug(`Service already exists`);
		return false;
	}
};

export const getService = async (namespace: string, name: string) => {
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

export const restartPods = async (namespace: string, serviceName: string, rollingRestart: boolean) => {
	try {
		const pods = filterNonTerminatedPods(await getPods(namespace, serviceName));

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
 * @param {string?} serviceName
 */
export const getPods = async (namespace: string, serviceName: string): Promise<any[]> => {
	try {
		const query = serviceName ? { qs: { labelSelector: "app=" + serviceName } } : {};
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
	console.log(111, namespace, serviceName, replicas);
	try {
		await client.apis.apps.v1beta2
			.namespaces(namespace)
			.deployments(serviceName)
			.scale.put({ body: deploymentScale(namespace, serviceName, replicas) });
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
		const { body } = await client.apis.apps.v1beta2.namespace(namespace).replicasets.get(query);

		return body.items;
	} catch (err: any) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 *
 * @param {string} serviceName
 */
function getConfigNameFromServiceName(serviceName: string) {
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
		return pod.status.containerStatuses && !pod.status.containerStatuses[0].state.terminated;
	});
}
