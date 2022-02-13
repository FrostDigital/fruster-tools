export interface ClusterRole {
	kind: string;
	apiVersion: string;
	metadata: {
		name: string;
		labels?: { [x: string]: string };
	};
	rules: { verbs: string[]; apiGroups: string[]; resources: string[] }[];
}
