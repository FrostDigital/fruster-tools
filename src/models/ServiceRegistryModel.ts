export interface ServiceRegistryModel {
	name: string;
	env?: { [x: string]: string };
	args?: { [x: string]: string };
	extends?: string;
	services: AppManifest[];
	apiVersion?: "1" | "2";
}

export interface AppManifest {
	name: string;
	repo?: string;
	image?: string;
	imageTag?: string;
	registry?: string;
	routable?: boolean;
	domains?: string[];
	resources?: {
		cpu: string;
		mem: string;
	};
	env: any;
	imagePullSecret?: string;
	livenessHealthCheck?: string;
}
