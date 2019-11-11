import { Client1_13 as Client } from "kubernetes-client";
const config = require("kubernetes-client/backends/request").config;
const client = new Client({ config: config.fromKubeconfig(), version: "1.9" });
const { deployment, namespace, secret, service } = require("./kube-templates");
const log = require("../log");

export const createNamespace = async (name: string, failIfExists = false) => {
	try {
		await client.api.v1.namespaces.post({ body: namespace(name) });
		log.debug(`Namespace ${name} created`);
	} catch (err) {
		if (err.code !== 409 || failIfExists) throw err;
		log.debug(`Namespace ${name} already exists`);
	}
};

export const createDeployment = async (serviceConfig: any) => {
	await createNamespace(serviceConfig.name);
	await createConfig(serviceConfig.name, serviceConfig.env);

	const deploymentManifest = deployment(serviceConfig.name, "fruster/fruster-api-gateway", serviceConfig.env);

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

export const createConfig = async (serviceName: string, env = {}) => {
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

export const createService = async (name: string, env: any, domains: string[]) => {
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
