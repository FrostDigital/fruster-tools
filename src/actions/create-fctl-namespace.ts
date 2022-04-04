import {
	createConfigMap,
	createNamespace,
	createSecret,
	getConfigMap,
	getNamespace,
	getSecret,
} from "../kube/kube-client";
import { configMap, GLOBAL_CONFIG_NAME, GLOBAL_SECRETS_NAME, secret } from "../kube/kube-templates";

/**
 * Creates a "fruster" namespace. Such namespace is meant to be used
 * to host apps.
 *
 * In addition to the namespace also an empty secret and configmap will be
 * created for global secrets and global config.
 */
export async function createFctlNamespace(namespaceName: string) {
	const namespace = await getNamespace(namespaceName);

	if (!namespace) {
		await createNamespace(namespaceName);
	}

	const globalSecret = await getSecret(namespaceName, GLOBAL_SECRETS_NAME);

	if (!globalSecret) {
		await createSecret(namespaceName, secret(namespaceName, GLOBAL_SECRETS_NAME, {}));
	}

	const globalConfig = await getConfigMap(namespaceName, GLOBAL_CONFIG_NAME);

	if (!globalConfig) {
		await createConfigMap(namespaceName, configMap(namespaceName, GLOBAL_CONFIG_NAME, {}));
	}

	return namespace;
}
