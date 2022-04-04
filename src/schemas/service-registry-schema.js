module.exports = {
	type: "object",
	additionalProperties: false,
	properties: {
		name: {
			description:
				"Name of service registry, non mandatory. Will be used as kubernetes namespace (but lowercased and dashed)",
			type: "string",
		},
		apiVersion: {
			description: "API version of schema, used for backward compatibility",
			type: "string",
		},
		env: {
			description:
				"Global env configuration set on all services. If same key exists on service level that will be used.",
			type: "object",
		},
		args: {
			description: "Definition of variables that can be reused in services `env` configuration.",
			type: "object",
		},
		imageChannel: {
			description: "Default image channel to track, for example `develop` or `master`.",
			type: "string",
		},
		extends: {
			description: "Optional filename to extend from",
			type: "string",
		},
		services: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: {
						description: "Name of service, is used as identifier if extending other service registries",
						type: "string",
					},
					repo: {
						description: "Git repo, shorthand syntax `frostdigital/fruster-api-gateway` assumes github",
						type: "string",
					},
					image: {
						description:
							"Docker image, shorthand syntax `fruster/fruster-api-gateway` assumes docker hub as registry",
						type: "string",
					},
					imageTag: {
						description: "Docker image tag, if not set `latest` will be used",
						type: "string",
					},
					imageChannel: {
						description:
							"Image channel, for example 'develop', 'master' or 'preprod'. If set the container will follow any new updates to docker images tagged for example `develop-*`. This cannot be used together with imageTag, if both are set imageTag will be used.",
						type: "string",
					},
					routable: {
						description:
							"If service is routable, meaning that TCP traffic will be routed to the service via ingress proxy/router",
						type: "boolean",
					},
					domains: {
						description:
							"Array of domain names, will default to name as service. Only applicable to `routable` is true",
						type: "array",
						items: {
							type: "string",
						},
					},
					resources: {
						type: "object",
						description: "Resource requests/limits set on kubernetes deployment",
						properties: {
							cpu: {
								description:
									"Cpu <request>/<limit> where limit is optional, for example 100m/500m or 100m. Default to 100m if none is set.",
								type: "string",
							},
							mem: {
								description:
									"Memory <request>/<limit> where limit is optional, for example 128M/256M or 128M. Default to 128M if none is set.",
								type: "string",
							},
						},
					},
					env: {
						type: "object",
						description:
							"Configuration for service that will be set as env variables, should be string key/value pairs",
					},
					imagePullSecret: {
						type: ["string", "null"],
						description:
							"Name of kubernetes imagePullSecret (in 'default' namespace) that will be used for this kubernetes deployment. If none is set it will look for credentials named 'regcred'.",
					},
					livenessHealthCheck: {
						type: "string",
						enum: ["fruster-health", "none"],
						description:
							"Type of liveness probe, defaults to `fruster-health` which will configure healt checks compatible with fruster-health-js",
					},
				},

				required: ["name"],
			},
		},
	},
	required: ["name"],
};
