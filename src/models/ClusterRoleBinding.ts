export interface ClusterRoleBinding {
	kind: string;
	apiVersion: string;
	metadata: {
		name: string;
		labels?: { [x: string]: string };
		annotations?: { [x: string]: string };
	};
	subjects: { kind: string; name: string; namespace: string }[];
	roleRef: { apiGroup: string; kind: string; name: string };
}
