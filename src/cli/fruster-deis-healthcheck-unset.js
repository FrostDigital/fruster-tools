#!/usr/bin/env node

const program = require("commander");
const deis = require("../deis");
const log = require("../log");

program
	.description(
		`
Removes health checks for given app(s).

Example:

$ fruster healthcheck unset pu-*
`
	)
	.parse(process.argv);

const appName = program.args[0];

if (!appName) {
	log.error("Missing app name or pattern");
	process.exit(1);
}

deis.apps(appName)
	.then((apps) => {
		if (!apps.length) {
			log.warn(`No app(s) found that matches ${appName}`);
			return process.exit(1);
		}

		log.info(`Removing healthcheck(s) on ${apps.length} app(s) - this may take a while...`);
		return Promise.all(apps.map((app) => deis.disableHealthcheck(app.id)));
	})
	.then((outputs) => {
		console.log(outputs.join("\n"));
		console.log(`
    Done - health check has been updated.
    You can view health check(s) with command:

    $ fruster healthcheck get "${appName}"
    `);
	})
	.catch((err) => {
		log.error(`Failed removing healtchecks: ${err.msg}`);
		process.exit(1);
	});
