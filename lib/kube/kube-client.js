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

const getNamespace = async name => {
	try {
		const { body } = await client.api.v1.namespaces(name).get();
		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

const getDeployment = async name => {
	try {
		const { body } = await client.apis.apps.v1
			.namespaces(name)
			.deployments(name)
			.get();

		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

const createDeployment = async (serviceConfig, dryRun = false) => {
	const existingDeployment = await getDeployment(serviceConfig.name);

	const deploymentManifest = deployment(
		serviceConfig.name,
		serviceConfig.image + ":" + (serviceConfig.imageTag || "latest"),
		// Use existing number of replicas in update of deployment
		existingDeployment ? existingDeployment.spec.replicas : 1,
		serviceConfig.env,
		serviceConfig.resources,
		serviceConfig.livenessHealthCheck
	);

	if (dryRun) {
		if (existingDeployment) {
			log.info(`[Dry run] Deployment ${serviceConfig.name} exists and will be updated`);
		} else {
			log.info(`[Dry run] Deployment ${serviceConfig.name} does not exist, will by created`);
		}
	} else {
		try {
			await client.apis.apps.v1.namespace(serviceConfig.name).deployments.post({ body: deploymentManifest });
			log.debug("Created deployment");
		} catch (err) {
			if (err.code !== 409) throw err;

			await client.apis.apps.v1
				.namespaces(serviceConfig.name)
				.deployments(serviceConfig.name)
				.put({ body: deploymentManifest });

			log.debug("Updated deployment");
		}
	}
};

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

const setConfig = async (serviceName, env = {}) => {
	const newSecret = secret(serviceName, { ...env });

	try {
		await client.api.v1.namespaces(serviceName).secrets.post({ body: newSecret });
		log.debug(`Created config for ${serviceName}`);
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.api.v1
			.namespace(serviceName)
			.secret(newSecret.metadata.name)
			.put({ body: newSecret });

		log.debug(`Updated config for ${serviceName}`);
	}
};

const getConfig = async serviceName => {
	try {
		const { body } = await client.api.v1
			.namespace(serviceName)
			.secret(serviceName + "-config")
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

const createService = async ({ name, env, domains = [] }) => {
	if (!domains.includes(name)) domains.push(name);

	const port = env.PORT;

	if (!port) {
		throw new Error("Missing PORT in env for " + name);
	}

	try {
		await client.api.v1.namespace(name).service.post({ body: service(name, port, domains) });
		log.debug(`Service created`);
		return true;
	} catch (err) {
		if (err.code !== 409) throw err;
		log.debug(`Service already exists`);
		return false;
	}
};

const getService = async name => {
	try {
		const { body } = await client.api.v1
			.namespace(name)
			.service(name)
			.get();
		return body;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

const deleteService = async name => {
	try {
		await client.api.v1
			.namespace(name)
			.service(name)
			.delete();
	} catch (err) {
		log.warn("Failed deleting service: " + name);
		return null;
	}
};

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

	// duplicate image pull secret so it exists in services namespace
	await createSecret(toNamespace, {
		...imagePullSecret,
		metadata: { name: secretName, namespace: toNamespace }
	});
};

const restartPods = async (serviceName, rollingRestart) => {
	try {
		if (rollingRestart) {
			const pods = filterNonTerminatedPods(await getPods(serviceName));

			if (pods && pods.length > 1) {
				log.warn("Performing rolling restart - do not stop this script while loading!");

				let i = 0;
				for (const pod of pods) {
					i++;
					log.info(
						`Rolling restart ${i}/${pods.length} (delay ${ROLLING_RESTART_DELAY_SEC}s in between restarts)`
					);
					const restartRes = await deletePod(serviceName, pod.metadata.name);

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

		await client.api.v1.namespace(serviceName).pods.delete();
		return true;
	} catch (err) {
		log.warn("Failed restarting pod(s), is service deployed yet?");
		console.log(err);
		return false;
	}
};

const getPods = async serviceName => {
	try {
		const { body } = await client.api.v1.namespace(serviceName).pods.get();
		return body.items;
	} catch (err) {
		if (err.code !== 404) throw err;
		return null;
	}
};

const scaleDeployment = async (serviceName, replicas) => {
	try {
		await client.apis.apps.v1beta2
			.namespaces(serviceName)
			.deployments(serviceName)
			.scale.put({ body: deploymentScale(serviceName, replicas) });
		return true;
	} catch (err) {
		console.log(err);
		return false;
	}
};

const deletePod = async (serviceName, podName) => {
	try {
		await client.api.v1
			.namespace(serviceName)
			.pod(podName)
			.delete();
		return true;
	} catch (err) {
		if (err.code !== 404) throw err;
		return false;
	}
};

module.exports = {
	createSecret,
	setConfig,
	createDeployment,
	getDeployment,
	scaleDeployment,
	createNamespace,
	getNamespace,
	createService,
	deleteService,
	getService,
	getSecret,
	copySecret,
	getConfig,
	restartPods,
	getPods,
	deletePod
};

function base64Decode(str) {
	return Buffer.from(str, "base64").toString();
}

function sleep(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function filterNonTerminatedPods(pods) {
	return pods.filter(pod => {
		return !pod.status.containerStatuses[0].state.terminated;
	});
}
