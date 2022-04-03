import k8s from "@kubernetes/client-node";

export interface Deployment extends k8s.V1Deployment {
	// apiVersion?: string;
	// kind?: string;
	// metadata: {
	// 	namespace: string;
	// 	name: string;
	// 	labels?: { [x: string]: string };
	// 	annotations?: { [x: string]: string };
	// 	[x: string]: any;
	// };
	// status?: {
	// 	readyReplicas: number;
	// 	availableReplicas: number;
	// 	replicas: number;
	// 	updatedReplicas: number;
	// 	unavailableReplicas: number;
	// };
	// spec: {
	// 	replicas: number;
	// 	strategy?: {
	// 		type: string;
	// 	};
	// 	selector?: {
	// 		matchLabels?: { [x: string]: string };
	// 	};
	// 	template: {
	// 		metadata: {
	// 			labels?: { [x: string]: string };
	// 			name?: string;
	// 			namespace?: string;
	// 			annotations?: { [x: string]: string };
	// 		};
	// 		spec: {
	// 			serviceAccountName?: string;
	// 			containers: {
	// 				resources?: Resources;
	// 				imagePullPolicy?: string;
	// 				livenessProbe?: any; // TODO
	// 				image: string;
	// 				name: string;
	// 				envFrom?: {
	// 					configMapRef?: {
	// 						name: string;
	// 					};
	// 					secretRef?: {
	// 						name: string;
	// 					};
	// 				}[];
	// 				env: {
	// 					name: string;
	// 					value?: string;
	// 					valueFrom?: {
	// 						fieldRef?: {
	// 							fieldPath: string;
	// 						};
	// 						secretKeyRef?: {
	// 							key: string;
	// 							name: string;
	// 						};
	// 					};
	// 				}[];
	// 			}[];
	// 			imagePullSecrets?: any; // TODO
	// 		};
	// 	};
	// };
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
