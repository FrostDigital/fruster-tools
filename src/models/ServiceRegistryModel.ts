export interface ServiceRegistryModel {
	name: string;
	env?: any;
	args?: any;
	extends?: string;
	services: AppManifest[];
}

export interface AppManifest {
	name: string;
	repo?: string;
	image?: string;
	imageTag?: string;
	routable?: boolean;
	domains?: string[];
	resources?: {
		cpu: string;
		mem: string;
	};
	env: any;
	imagePullSecret?: string;
	livenessHealthCheck?: "fruster-health" | "none";
}
