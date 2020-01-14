const { Client } = require("kubernetes-client");
const { kubeClientVersion } = require("../../conf");
const { deployment, namespace, secret, service, deploymentScale } = require("./kube-templates");
const log = require("../log");

const client = new Client({ version: kubeClientVersion });

const ROLLING_RESTART_DELAY_SEC = 10;

/**
 * Creates a namespace. Returns true if created, or false if it already exists.
 * @param {string} name
 * @param {boolean=} dryRun
 */
const createNamespace = async (name, dryRun = false) => {
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
	} catch (err) {
		if (err.code !== 409) throw err;
		log.debug(`Namespace ${name} already exists`);
		return false;
	}
};

/**
 * @param {string} name
 */
const getNamespace = async name => {
	try {
		const { body } = await client.api.v1.namespaces(name).get();
		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 * @param {string} namespace
 * @param {string} name
 */
const getDeployment = async (namespace, name) => {
	try {
		const { body } = await client.apis.apps.v1
			.namespaces(namespace)
			.deployments(name)
			.get();

		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 *
 * @param {string?} namespace
 * @param {string?} app
 */
const getDeployments = async (namespace = null, app = null) => {
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
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 *
 * @param {string} namespace
 * @param {string} name
 */
const deleteDeployment = async (namespace, name) => {
	try {
		const { body } = await client.apis.apps.v1
			.namespaces(namespace)
			.deployments(name)
			.delete();
		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 * @param {string} namespace
 * @param {any} serviceConfig
 * @param {string} changeCause
 */
const createDeployment = async (namespace, serviceConfig, changeCause) => {
	const existingDeployment = await getDeployment(namespace, serviceConfig.name);

	const deploymentManifest = deployment({
		namespace,
		appName: serviceConfig.name,
		image: serviceConfig.image, //+ ":" + (serviceConfig.imageTag || "latest"),
		imageTag: serviceConfig.imageTag,
		imageChannel: serviceConfig.imageChannel,
		// Use existing number of replicas in update of deployment
		replicas: existingDeployment ? existingDeployment.spec.replicas : 1,
		env: serviceConfig.env,
		resources: serviceConfig.resources,
		livenessHealthCheckType: serviceConfig.livenessHealthCheck,
		changeCause
	});

	try {
		await client.apis.apps.v1.namespace(namespace).deployments.post({ body: deploymentManifest });
		log.debug("Created deployment");
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.apis.apps.v1
			.namespaces(namespace)
			.deployments(serviceConfig.name)
			.put({ body: deploymentManifest });

		log.debug("Updated deployment");
	}
};

/**
 *
 * @param {string} namespace
 * @param {string} deploymentName
 * @param {any} patch
 */
const patchDeployment = async (namespace, deploymentName, patch) => {
	try {
		await client.apis.apps.v1
			.namespace(namespace)
			.deployments(deploymentName)
			.patch(patch);
		log.debug("Patched deployment");
	} catch (err) {
		log.error("Failed to patch deployment " + deploymentName);
		console.log(err);
	}
};

/**
 * @param {string} name
 */
const getSecret = async (name, namespace = "default") => {
	try {
		const { body } = await client.api.v1
			.namespaces(namespace)
			.secret(name)
			.get();
		return body;
	} catch (err) {
		return null;
	}
};

/**
 * @param {string} namespace
 * @param {string} serviceName
 * @param {any} env
 */
const setConfig = async (namespace, serviceName, env) => {
	const newSecret = secret(namespace, serviceName, { ...(env || {}) });

	try {
		await client.api.v1.namespaces(namespace).secrets.post({ body: newSecret });
		log.debug(`Created config for ${serviceName}`);
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.api.v1
			.namespace(namespace)
			.secret(newSecret.metadata.name)
			.put({ body: newSecret });

		log.debug(`Updated config for ${serviceName}`);
	}
};

/**
 * @param {string} namespace
 * @param {string} serviceName
 */
const getConfig = async (namespace, serviceName) => {
	try {
		const { body } = await client.api.v1
			.namespace(namespace)
			.secret(getConfigNameFromServiceName(serviceName))
			.get();

		if (body.data) {
			Object.keys(body.data).forEach(key => {
				body.data[key] = base64Decode(body.data[key]);
			});
		}

		return body.data;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 * @param {string} namespace
 * @param {any} secret
 */
const createSecret = async (namespace, secret) => {
	secret.metadata.namespace = namespace;

	try {
		await client.api.v1.namespaces(namespace).secrets.post({ body: secret });
		log.debug(`Created secret for ${namespace}`);
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.api.v1
			.namespace(namespace)
			.secret(secret.metadata.name)
			.put({ body: secret });

		log.debug(`Updated config for ${namespace}`);
	}
};

/**
 * @param {string} namespace
 * @param {string} secretName
 */
const deleteSecret = async (namespace, secretName) => {
	try {
		await client.api.v1
			.namespaces(namespace)
			.secrets(secretName)
			.delete();
	} catch (err) {
		if (err.code !== 404) throw err;
	}
};

/**
 *
 * @param {string} namespace
 * @param {any} params
 */
const createService = async (namespace, { name, env, domains = [] }) => {
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
	} catch (err) {
		if (err.code !== 409) throw err;
		log.debug(`Service already exists`);
		return false;
	}
};

/**
 *
 * @param {string} namespace
 * @param {string} name
 */
const getService = async (namespace, name) => {
	try {
		const { body } = await client.api.v1
			.namespace(namespace)
			.service(name)
			.get();
		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 *
 * @param {string} namespace
 * @param {string} name
 */
const deleteService = async (namespace, name) => {
	try {
		await client.api.v1
			.namespace(namespace)
			.service(name)
			.delete();
		return true;
	} catch (err) {
		log.debug("Failed deleting service: " + name);
		return false;
	}
};

/**
 * @param {string} secretName
 * @param {string} fromNamespace
 * @param {string} toNamespace
 */
const copySecret = async (secretName, fromNamespace, toNamespace) => {
	// image pull secret is needed if image is hosted in private registry
	// the strategy is that the secret must already exist in the default namespace
	// and this will copied to a secret in the services namespace
	const imagePullSecret = await getSecret(secretName, fromNamespace);

	if (!imagePullSecret) {
		return log.error(
			`Image pull secret named ${secretName} does not exist in default namespace.\nFollow documentation here to create secret https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/`
		);
	}

	const existingPulllSecret = await getSecret(secretName, toNamespace);
	if (
		existingPulllSecret &&
		existingPulllSecret.data[".dockerconfigjson"] === imagePullSecret.data[".dockerconfigjson"]
	) {
		log.debug("Sercet already exists, nothing to do ");
		return;
	}

	// duplicate image pull secret so it exists in services namespace
	await createSecret(toNamespace, {
		...imagePullSecret,
		metadata: { name: secretName, namespace: toNamespace }
	});
};

/**
 * @param {string} namespace
 * @param {string} serviceName
 * @param {boolean} rollingRestart
 */
const restartPods = async (namespace, serviceName, rollingRestart) => {
	try {
		const pods = filterNonTerminatedPods(await getPods(namespace, serviceName));

		if (rollingRestart) {
			if (pods && pods.length > 1) {
				log.warn("Performing rolling restart - do not stop this script while loading!");

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
	} catch (err) {
		log.warn("Failed restarting pod(s), is service deployed yet?");
		console.log(err);
		return false;
	}
};

/**
 * @param {string?} namespace
 * @param {string?} serviceName
 */
const getPods = async (namespace, serviceName) => {
	try {
		const query = serviceName ? { qs: { labelSelector: "app=" + serviceName } } : {};
		let res;

		if (namespace) {
			res = await client.api.v1.namespace(namespace).pods.get(query);
		} else {
			res = await client.api.v1.pods.get(query);
		}

		return res.body.items;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 * @param {string} namespace
 * @param {string} serviceName
 * @param {number} replicas
 */
const scaleDeployment = async (namespace, serviceName, replicas) => {
	try {
		await client.apis.apps.v1beta2
			.namespaces(namespace)
			.deployments(serviceName)
			.scale.put({ body: deploymentScale(namespace, serviceName, replicas) });
		return true;
	} catch (err) {
		console.log(err);
		return false;
	}
};

/**
 * @param {string} namespace
 * @param {string} podName
 */
const deletePod = async (namespace, podName) => {
	try {
		await client.api.v1
			.namespace(namespace)
			.pod(podName)
			.delete();
		return true;
	} catch (err) {
		if (err.code !== 404) throw err;
		return false;
	}
};

/**
 *
 * @param {string} appName
 * @return {Promise<string[]>}
 */
const getNamespaceForApp = async appName => {
	const deployments = await getDeployments(null, appName);

	if (deployments.items.length) {
		return deployments.items.map(item => item.metadata.namespace);
	} else {
		return [];
	}
};

/**
 *
 * @param {string} namespace
 * @param {string} podName
 * @param {number=} tailLines
 * @param {boolean=} streamLogs
 */
const getLogs = async (namespace, podName, tailLines = 100, streamLogs = false) => {
	try {
		if (streamLogs) {
			const stream = await client.api.v1
				.namespace(namespace)
				.po(podName)
				.log.getStream();

			return stream;
		} else {
			const { body } = await client.api.v1
				.namespace(namespace)
				.po(podName)
				.log.get({ qs: { tailLines } });

			return body;
		}
	} catch (err) {
		console.log(err);
	}
};

/**
 * @param {string?} namespace
 * @param {string?} serviceName
 */
const getReplicaSets = async (namespace, serviceName) => {
	try {
		const query = serviceName ? { qs: { labelSelector: "app=" + serviceName } } : {};
		const { body } = await client.apis.apps.v1beta2.namespace(namespace).replicasets.get(query);

		return body.items;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

/**
 *
 * @param {string} serviceName
 */
function getConfigNameFromServiceName(serviceName) {
	return serviceName + "-config";
}

module.exports = {
	createSecret,
	deleteSecret,
	getSecret,
	copySecret,
	setConfig,
	createDeployment,
	getDeployment,
	getDeployments,
	scaleDeployment,
	patchDeployment,
	createNamespace,
	getNamespace,
	createService,
	deleteService,
	getService,
	getConfig,
	restartPods,
	getPods,
	deletePod,
	deleteDeployment,
	getNamespaceForApp,
	getLogs,
	getReplicaSets
};

/**
 *
 * @param {string} str
 */
function base64Decode(str) {
	return Buffer.from(str, "base64").toString();
}

/**
 *
 * @param {number} ms
 */
function sleep(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

/**
 *
 * @param {any[]} pods
 */
function filterNonTerminatedPods(pods) {
	return pods.filter(pod => {
		return pod.status.containerStatuses && !pod.status.containerStatuses[0].state.terminated;
	});
}
