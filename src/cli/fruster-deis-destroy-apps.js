#!/usr/bin/env node

const { program } = require("commander");
const deis = require("../deis");
const serviceRegistryFactory = require("../service-registry");
const log = require("../log");
const Promise = require("bluebird");

program
	.description(
		`
Destroy all deis apps that are defined in service registry. Non existing ones will warn but not fail.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster destroy-apps frostdigital/paceup
`
	)
	.option("-d, --dry-run", "just check, no writing")
	.option("-e, --environment <environment>", "prod|int|stg etc")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = program.opts().dryRun;
const environment = program.opts().environment;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
}

serviceRegistryFactory
	.create(serviceRegPath, { environment: environment })
	.then((serviceRegistry) => {
		return deis.apps().then((apps) => {
			return Promise.mapSeries(serviceRegistry.services, (service) => {
				let promise = Promise.resolve();

				if (apps.find((app) => app.id == service.name)) {
					log.info(`[${service.name}] Destroying app...`);

					if (!dryRun) {
						promise
							.then(() => deis.deleteApp(service.name))
							.catch((err) => {
								log.error(`Failed destroying app ${service.name}`);
								console.log(err);
								throw err;
							});
					}
				} else {
					log.info(`[${service.name}] Already destroyed`);
				}

				return promise;
			});
		});
	})
	.then((res) => {
		if (!dryRun) {
			log.success(`\n✔ ${res.length} app(s) destroyed`);
		}
	})
	.catch((err) => {
		console.log(err);
		process.exit(1);
	});
