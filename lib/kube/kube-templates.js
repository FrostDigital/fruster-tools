module.exports = {
	deployment: (serviceName, image, env = {}, memoryLimit = "128Mi", memoryRequest = "128Mi") => {
		return {
			apiVersion: "apps/v1",
			kind: "Deployment",
			metadata: {
				name: serviceName,
				namespace: serviceName,
				labels: {
					// force: force update even if tag is not semver, ie: latest, optional label: keel.sh/match-tag=true
					// which will enforce that only the same tag will trigger force update.
					"keel.sh/policy": "force",
					"keel.sh/match-tag": "true",
					// Poll registry for updates
					"keel.sh/trigger": "poll"
				},
				annotations: {
					"keel.sh/pollSchedule": "@every 5m"
				}
			},
			spec: {
				replicas: 1,
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
						namespace: serviceName
					},
					spec: {
						containers: [
							{
								image: image,
								imagePullPolicy: "IfNotPresent",
								livenessProbe: {
									exec: {
										command: ["/bin/cat", ".health"]
									},
									failureThreshold: 3,
									initialDelaySeconds: 50,
									periodSeconds: 10,
									successThreshold: 1,
									timeoutSeconds: 50
								},
								name: serviceName,
								resources: {
									limits: {
										memory: memoryLimit
									},
									requests: {
										memory: memoryRequest
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

	namespace: name => {
		return {
			apiVersion: "v1",
			kind: "Namespace",
			metadata: {
				name
			}
		};
	},

	secret: (serviceName, config = {}) => {
		Object.keys(config).forEach(key => {
			config[key] = Buffer.from(config[key]).toString("base64");
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
				namespace: serviceName
			},
			type: "Opaque"
		};
	},

	service: (serviceName, targetPort, domains) => {
		const annotations = {
			"router.deis.io/maintenance": "False",
			"router.deis.io/ssl.enforce": "False"
		};

		if (domains) {
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
				namespace: serviceName
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
	}
};
