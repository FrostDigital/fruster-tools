#!/usr/bin/env node

const { program } = require("commander");
const deis = require("../deis");
const serviceRegistryFactory = require("../service-registry");
const log = require("../log");
const Promise = require("bluebird");

program
	.description(
		`
Applies config from service registry. Any config changes will be set on active deis cluster.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster config apply frostdigital/paceup
`
	)
	.option("-f, --force", "override config if conflicts")
	.option("-p, --prune", "remove config from apps that is not defined in service registry")
	.option("-c, --create-apps", "create app(s) if non existing")
	.option("-y, --yes", "perform the change, otherwise just dry run")
	.option("-p, --pass-host-env", "pass current env to services")
	.option("-h, --add-healthcheck", "adds healthchecks")
	.option("-p, --print", "print config to stdout")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const createApps = program.opts().createApps;
const dryRun = !program.opts().yes;
const prune = program.opts().prune;
const passEnv = program.opts().passHostEnv;
const addHealthcheck = program.opts().addHealthcheck;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
}

serviceRegistryFactory
	.create(serviceRegPath, { passHostEnv: passEnv })
	.then((serviceRegistry) => {
		return deis
			.apps()
			.then((apps) => {
				return Promise.mapSeries(serviceRegistry.services, (service) => {
					let promise = Promise.resolve();

					if (!apps.find((app) => app.id == service.name)) {
						if (createApps) {
							console.log(`[${service.name}] Creating app ...`);

							if (!dryRun) {
								promise.then(() => deis.createApp(service.name));
							}
						} else {
							log.warn(`Service ${service.name} does not exist in deis, skipping config of this service`);
							// @ts-ignore
							service.skip = true;
						}
					}

					return promise;
				});
			})
			.then(() => {
				// @ts-ignore
				let services = serviceRegistry.services.filter((service) => !service.skip);

				if (program.opts().print) {
					services.forEach((service) => {
						console.log(service.name);

						Object.keys(service.env)
							.sort()
							.forEach((k) => {
								console.log(k, "=", service.env[k]);
							});

						console.log();
					});
				}

				let changeSetPromises = services.map((service) => {
					// @ts-ignore
					return deis.getConfig(service.name).then((existingConfig) => {
						let changeSet = {
							values: {},
							healthcheck: undefined,
						};

						for (let k in existingConfig.values) {
							if (service.env[k] === undefined) {
								if (prune) {
									log.warn(
										`[${service.name}] Will remove ${k} (value was "${existingConfig.values[k]}")`
									);
									// @ts-ignore
									changeSet.values[k] = null;
								} else {
									log.warn(
										`[${service.name}] App has config ${k} which is missing in service registry, use --prune to remove this, current value is "${existingConfig.values[k]}"`
									);
								}
							} else if (existingConfig.values[k] != service.env[k]) {
								console.log(
									`[${service.name}] Updating ${k} ${existingConfig.values[k]} -> ${service.env[k]}`
								);
								// @ts-ignore
								changeSet.values[k] = service.env[k];
							}
						}

						for (let k in service.env) {
							if (existingConfig.values[k] === undefined) {
								console.log(`[${service.name}] New config ${k}=${service.env[k]}`);
								// @ts-ignore
								changeSet.values[k] = service.env[k];
							}
						}

						if (!Object.keys(changeSet.values).length) {
							log.success(`[${service.name}] up to date`);
							// @ts-ignore
							changeSet.values = undefined;
						}

						if (addHealthcheck && service.livenessHealthCheck === "fruster-health") {
							if (
								!existingConfig.healthcheck ||
								Object.keys(existingConfig.healthcheck).length === 0 ||
								Object.keys(existingConfig.healthcheck["web/cmd"]).length === 0
							) {
								console.log(`[${service.name}] Enabling healthcheck`);

								if (!dryRun) {
									// @ts-ignore
									changeSet.healthcheck = {
										"web/cmd": {
											livenessProbe: {
												initialDelaySeconds: 50,
												timeoutSeconds: 50,
												periodSeconds: 10,
												successThreshold: 1,
												failureThreshold: 3,
												exec: {
													command: ["/bin/cat", ".health"],
												},
											},
										},
									};
								}
							}
						}

						return Promise.resolve({
							changeSet: changeSet,
							serviceName: service.name,
						});
					});
				});

				return Promise.all(changeSetPromises).mapSeries((changeSet) => {
					if (!dryRun && (changeSet.changeSet.values || changeSet.changeSet.healthcheck)) {
						console.log(`[${changeSet.serviceName}] Updating config...`);
						return (
							deis
								.setConfig(changeSet.serviceName, changeSet.changeSet)
								.then(() => {
									log.success(`[${changeSet.serviceName}] Done updating`);
								})
								// @ts-ignore
								.catch((err) => {
									log.error(
										`[${changeSet.serviceName}] got error while updating config:\n${err.message}`
									);
								})
						);
					}
				});
			})
			.then(() => {
				if (dryRun) {
					console.log("This is a dry run, confirm by adding flag -y or --yes");
				}
			});
	})
	.catch((err) => {
		console.log(err);
		process.exit(1);
	});
