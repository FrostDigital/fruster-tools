import k8s from "@kubernetes/client-node";

export interface Deployment extends k8s.V1Deployment {}

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
