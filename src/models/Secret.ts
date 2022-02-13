export interface Secret {
	kind: string;
	apiVersion: string;
	metadata: {
		name: string;
		namespace: string;
		annotations?: { [x: string]: string };
		labels?: { [x: string]: string };
	};
	data: { [x: string]: string };
	type?: string;
}
