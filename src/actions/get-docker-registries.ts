import { getSecrets } from "../kube/kube-client";
import { Registry } from "../models/Registry";

/**
 * Finds alls docker registries that are configured with a auth token
 * withing the cluster.
 *
 * The secret is a base64 encoded auth JSON object needed to access docker registries.
 *
 * @param namespace
 * @returns
 */
export async function getDockerRegistries(namespace?: string): Promise<Registry[]> {
	const res = await getSecrets(namespace);

	if (!res) {
		return [];
	}

	return res
		.filter((r) => r.type === "kubernetes.io/dockerconfigjson")
		.map((r) => {
			const data = r.data || {};
			const dockerAuth = JSON.parse(Buffer.from(data[".dockerconfigjson"], "base64").toString("ascii"));
			return {
				dockerAuthToken: dockerAuth.auths[Object.keys(dockerAuth.auths)[0]].auth,
				secretName: r.metadata?.name!,
				registryHost: Object.keys(dockerAuth.auths)[0],
				namespace: r.metadata?.namespace!,
			};
		});
}
