#!/usr/bin/env node

const program = require("commander");
const deis = require("../lib/deis");

program
	.description(
		`
Get config for app(s). Supports pattern on app name to get config for
multiple apps.

Example:

# Returns all apps starting with "ag"
$ fruster config get -a "ag*"
`
	)
	.option("-a, --app <app name>", "Application name or pattern with wildcard")
	.parse(process.argv);

const appName = program.app;

deis.apps(appName)
	.then(apps => {
		return Promise.all(
			apps.map(app =>
				deis.getConfig(app.id).then(config => {
					return {
						config: config,
						appId: app.id
					};
				})
			)
		);
	})
	.then(configAndApps => {
		configAndApps.forEach(configAndApp => {
			console.log(`\n--- ${configAndApp.appId} ---\n`);

			if (Object.keys(configAndApp.config).length) {
				for (let k in configAndApp.config) {
					console.log(`${k}=${configAndApp.config[k]}`);
				}
			}
			console.log("");
		});
	});
