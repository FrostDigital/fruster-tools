import requestPromise from "request-promise";

export async function listRepos(authToken: string, registryUrl: string): Promise<string[]> {
	const list = await requestPromise.get(`${registryUrl}/v2/_catalog`, {
		headers: {
			Authorization: `Basic ${authToken}`,
		},
		json: true,
	});

	return list.repositories;
}

export async function listTags(authToken: string, registryUrl: string, repo: string): Promise<string[]> {
	const list = await requestPromise.get(`${registryUrl}/v2/${repo}/tags/list`, {
		headers: {
			Authorization: `Basic ${authToken}`,
		},
		json: true,
	});

	return list.tags;
}
