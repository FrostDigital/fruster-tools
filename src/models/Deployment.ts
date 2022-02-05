export interface Deployment {
	apiVersion: string;
	kind: string;
	metadata: {
		namespace: string;
		name: string;
		labels?: { [x: string]: string };
		[x: string]: any;
	};
	spec: {
		replicas: number;
		strategy?: {
			type: string;
		};
		selector?: {
			matchLabels?: { [x: string]: string };
		};
		template: {
			metadata: {
				labels?: { [x: string]: string };
				name?: string;
				namespace?: string;
				annotations?: { [x: string]: string };
			};
			spec: {
				serviceAccountName?: string;
				containers: {
					resources?: Resources;
					imagePullPolicy?: string;
					livenessProbe?: any; // TODO
					image: string;
					name: string;
					env: {
						name: string;
						value?: string;
						valueFrom?: {
							secretKeyRef: {
								key: string;
								name: string;
							};
						};
					}[];
				}[];
				imagePullSecrets?: any; // TODO
			};
		};
	};
}

export interface Resources {
	requests?: {
		cpu: string;
		memory: string;
	};
	limits?: {
		cpu: string;
		memory: string;
	};
}
