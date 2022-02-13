export interface ServiceAccount {
	kind: string;
	apiVersion: string;
	metadata: {
		name: string;
		namespace: string;
		labels?: { [x: string]: string };
	};
	secrets?: string[];
}
