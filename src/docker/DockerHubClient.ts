import requestPromise from "request-promise";

const baseUrl = "https://hub.docker.com/v2";

// TODO: Handle pagination

export async function listRepos(org: string): Promise<string[]> {
	const { results } = await requestPromise.get(`${baseUrl}/repositories/${org}?page_size=1000`, {
		json: true,
	});

	return results.map((r: any) => r.name);
}

export async function listTags(org: string, repo: string): Promise<string[]> {
	const { results } = await requestPromise.get(`${baseUrl}/repositories/${org}/${repo}/tags?page_size=1000`, {
		json: true,
	});

	return results.map((r: any) => r.name);
}
