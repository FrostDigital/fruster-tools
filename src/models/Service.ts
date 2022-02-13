export interface Service {
	apiVersion: string;
	kind: string;
	metadata: {
		namespace: string;
		name: string;
		labels?: { [x: string]: string };
		annotations?: { [x: string]: string };
		[x: string]: any;
	};

	spec: {
		ports: {
			targetPort: number;
			name: string;
			port: number;
			protocol: string;
		}[];
		selector: {
			app: string;
		};
		sessionAffinity?: string;
		type: string;
	};
}
