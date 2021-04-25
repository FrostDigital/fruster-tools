#!/usr/bin/env node

const program = require("commander");
const deis = require("../lib/deis");
const serviceRegistryFactory = require("../lib/service-registry");
const log = require("../lib/log");
const Promise = require("bluebird");

program
	.description(
		`
Create apps defined in service registry. Will skip apps that already exists.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster config create-apps frostdigital/paceup
`
	)
	.option("-d, --dry-run", "just check, no writing")
	.parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = program.dryRun;

if (!serviceRegPath) {
	console.log("Missing service registry path");
	process.exit(1);
}

serviceRegistryFactory
	.create(serviceRegPath)
	.then(serviceRegistry => {
		return deis.apps().then(apps => {
			return Promise.mapSeries(serviceRegistry.services, service => {
				let promise = Promise.resolve();

				if (!apps.find(app => app.id == service.appName)) {
					log.info(`[${service.appName}] Creating app ...`);

					if (!dryRun) {
						promise.then(() => deis.createApp(service.appName));
					}
				} else {
					log.success(`[${service.appName}] Already exists`);
				}

				return promise;
			});
		});
	})
	.then(res => {
		if (!dryRun) {
			log.success(`\n✔ ${res.length} app(s) created`);
		}
	})
	.catch(err => {
		console.log(err);
		process.exit(1);
	});
