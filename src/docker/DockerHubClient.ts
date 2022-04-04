import requestPromise from "request-promise";

const baseUrl = "https://hub.docker.com/v2";

// TODO: Handle pagination

export async function listRepos(org: string): Promise<string[]> {
	const { results } = await requestPromise.get(`${baseUrl}/repositories/${org}?page_size=1000`, {
		json: true,
	});

	return results.map((r: any) => r.name);
}

export async function listTags({
	org,
	repo,
}: {
	org?: string;
	repo: string;
}): Promise<{ name: string; lastUpdated: string }[]> {
	org = org || "library"; // "library" is org for official images

	const path = `${baseUrl}/repositories/${org}/${repo}/tags`;

	const { results } = await requestPromise.get(`${path}?page_size=1000`, {
		json: true,
	});

	return results.map((r: { name: string; last_updated: string }) => ({
		name: r.name,
		lastUpdated: r.last_updated,
	}));
}
