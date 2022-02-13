export interface ConfigMap {
	kind: "ConfigMap";
	apiVersion: "v1";
	metadata: {
		name: string;
		namespace: string;
		annotations?: { [x: string]: string };
		labels?: { [x: string]: string };
	};
	data: { [x: string]: string };
}
