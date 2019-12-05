#!/usr/bin/env node

const program = require("commander");
const deis = require("../lib/deis");

program
	.description(
		`
Removes config on app(s). Supports wildcard on app name to be able to
same config on multiple apps.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster config unset SYSLOG LOG_LEVEL -a "ag-*"
`
	)
	.option("-a, --app <app name>", "Application name or pattern with wildcard")
	.parse(process.argv);

const appName = program.app;
const config = program.args;

if (!config.length) {
	console.log("Missing config");
	process.exit(-1);
}

deis.apps(appName)
	.then(apps => {
		console.log(`Removing config on ${apps.length} app(s) - this may take a while...`);
		return Promise.all(apps.map(app => deis.removeConfig(app.id, config)));
	})
	.then(() => {
		console.log(`
Done - config is currently being updated.
You can view config with command:

$ fruster config get -a "${appName}"`);
	});
