module.exports = {
	/**
	 * @param {string} namespace
	 * @param {string} serviceName
	 * @param {any} image
	 */
	deployment: (
		namespace,
		serviceName,
		image,
		replicas = 1,
		env = {},
		resources = { cpu: "100m/1000m", mem: "128Mi/256Mi" },
		livenessHealthCheckType = "fruster-health"
	) => {
		const [memReq, memLimit] = resources.mem.split("/");
		const [cpuReq, cpuLimit] = resources.cpu.split("/");

		const livenessProbe =
			livenessHealthCheckType === "fruster-health"
				? {
						exec: {
							command: ["/bin/cat", ".health"]
						},
						failureThreshold: 3,
						initialDelaySeconds: 50,
						periodSeconds: 10,
						successThreshold: 1,
						timeoutSeconds: 50
				  }
				: {};

		return {
			apiVersion: "apps/v1",
			kind: "Deployment",
			metadata: {
				name: serviceName,
				namespace,
				labels: {
					// force: force update even if tag is not semver, ie: latest, optional label: keel.sh/match-tag=true
					// which will enforce that only the same tag will trigger force update.
					"keel.sh/policy": "force",
					"keel.sh/match-tag": "true",
					// Poll registry for updates
					"keel.sh/trigger": "poll",
					// To identify that this is a "fruster" service, not mission critical, might not be used
					fruster: "true"
				},
				annotations: {
					"keel.sh/pollSchedule": "@every 5m"
				}
			},
			spec: {
				replicas,
				strategy: {
					type: "RollingUpdate"
				},
				selector: {
					matchLabels: {
						app: serviceName
					}
				},
				template: {
					metadata: {
						labels: {
							app: serviceName
						},
						name: serviceName,
						namespace
					},
					spec: {
						containers: [
							{
								image: image,
								imagePullPolicy: "IfNotPresent",
								livenessProbe,
								name: serviceName,
								resources: {
									limits: {
										memory: memLimit,
										cpu: cpuLimit
									},
									requests: {
										memory: memReq,
										cpu: cpuReq
									}
								},
								env: Object.keys(env).map(key => {
									return {
										name: key,
										valueFrom: {
											secretKeyRef: {
												key,
												name: serviceName + "-config"
											}
										}
									};
								})
							}
						],
						imagePullSecrets: [
							{
								name: "frost-docker-hub"
							}
						]
					}
				}
			}
		};
	},

	/**
	 * @param {string} name
	 */
	namespace: name => {
		return {
			apiVersion: "v1",
			kind: "Namespace",
			metadata: {
				name
			}
		};
	},

	/**
	 * @param {string} namespace
	 * @param {string} serviceName
	 * @param {any} config
	 */
	secret: (namespace, serviceName, config) => {
		Object.keys(config).forEach(key => {
			config[key] = Buffer.from(config[key] + "").toString("base64");
		});

		return {
			apiVersion: "v1",
			data: config,
			kind: "Secret",
			metadata: {
				labels: {
					app: serviceName
					//type: "env"
				},
				name: serviceName + "-config",
				namespace
			},
			type: "Opaque"
		};
	},

	/**
	 * @param {string} namespace
	 * @param {string} serviceName
	 * @param {number|string} targetPort
	 * @param {string[]} domains
	 */
	service: (namespace, serviceName, targetPort, domains) => {
		const annotations = {
			"router.deis.io/maintenance": "False",
			"router.deis.io/ssl.enforce": "False"
		};

		if (domains) {
			// @ts-ignore
			annotations["router.deis.io/domains"] = domains.join(",");
		}

		return {
			apiVersion: "v1",
			kind: "Service",
			metadata: {
				annotations,
				labels: {
					app: serviceName,
					"router.deis.io/routable": "true"
				},
				name: serviceName,
				namespace
			},
			spec: {
				ports: [
					{
						name: "http",
						port: 80,
						protocol: "TCP",
						targetPort: Number(targetPort)
					}
				],
				selector: {
					app: serviceName
				},
				sessionAffinity: "None",
				type: "ClusterIP"
			}
		};
	},

	/**
	 * @param {string} namespace
	 * @param {string} serviceName
	 * @param {number} replicas
	 */
	deploymentScale: (namespace, serviceName, replicas) => {
		return {
			kind: "Scale",
			apiVersion: "apps/v1beta2",
			metadata: {
				name: serviceName,
				namespace
			},
			spec: { replicas: Number(replicas) }
		};
	}
};
