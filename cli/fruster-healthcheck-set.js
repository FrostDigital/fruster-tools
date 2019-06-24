#!/usr/bin/env node

const program = require("commander");
const deis = require("../lib/deis");
const log = require("../lib/log");
const Promise = require("bluebird");

program
	.description(
		`
Sets health check that is compatible with fruster-health https://github.com/FrostDigital/fruster-health-js).

Example:

# Enable healtchecks for all services with names starting with "pu"
$ fruster healthcheck set pu-*
`
	)
	.parse(process.argv);

const appName = program.args[0];

if (!appName) {
	log.error("Missing app name or pattern");
	process.exit(1);
}

deis.apps(appName)
	.then(apps => {
		log.info(
			`Enabling healthcheck on ${
				apps.length
			} app(s) - this may take a while...`
		);
		return Promise.mapSeries(apps, app => {
			log.info(`[${app.id}] enabling healtcheck...`);
			return deis.enableHealthcheck(app.id).catch(err => {
				log.error(`[${app.id}] failed setting healtcheck: ${err}`);
			});
		});
	})
	.then(outputs => {
		//console.log(outputs.join("\n"));
		console.log(`
    Done - health check has been updated.
    You can view health check(s) with command:

    $ fruster healthcheck get "${appName}"
    `);
	});
