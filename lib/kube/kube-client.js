const { Client } = require("kubernetes-client");
const config = require("kubernetes-client/backends/request").config;
const client = new Client({ config: config.fromKubeconfig(), version: "1.9" });
const { deployment, namespace, secret, service } = require("./kube-templates");
const log = require("../log");

const createNamespace = async (name, failIfExists = false) => {
	try {
		await client.api.v1.namespaces.post({ body: namespace(name) });
		log.debug(`Namespace ${name} created`);
	} catch (err) {
		if (err.code !== 409 || failIfExists) throw err;
		log.debug(`Namespace ${name} already exists`);
	}
};

const createDeployment = async serviceConfig => {
	const deploymentManifest = deployment(serviceConfig.name, serviceConfig.image, serviceConfig.env);

	try {
		await client.apis.apps.v1.namespaces(serviceConfig.name).deployments.post({ body: deploymentManifest });
		log.info("Created deployment");
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.apis.apps.v1
			.namespaces(serviceConfig.name)
			.deployments(serviceConfig.name)
			.put({ body: deploymentManifest });

		log.info("Updated deployment");
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

const createConfig = async (serviceName, env = {}) => {
	const newSecret = secret(serviceName, { ...env });

	try {
		await client.api.v1.namespaces(serviceName).secrets.post({ body: newSecret });
		log.debug(`Create config for ${serviceName}`);
	} catch (err) {
		if (err.code !== 409) throw err;

		await client.api.v1
			.namespace(serviceName)
			.secret(newSecret.metadata.name)
			.put({ body: newSecret });

		log.debug(`Updated config for ${serviceName}`);
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

const createService = async ({ name, env, domains }) => {
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

module.exports = {
	createSecret,
	createConfig,
	createDeployment,
	createNamespace,
	createService,
	getSecret,
	copySecret
};
