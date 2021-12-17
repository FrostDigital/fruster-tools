#!/usr/bin/env node
const { program } = require("commander");
const deis = require("../deis");

program
	.option("-r, --create-remote", "Creates an git remote with same name as service name")
	.description(
		`
Clone an existing deis app and its configuration. Will not clone any release.
`
	)
	.parse(process.argv);

const appToClone = program.args[0];
const targetAppName = program.args[1];

deis.apps("*").then((apps) => {
	if (apps.find((a) => a.id == targetAppName)) {
		console.log(`ERROR: App named ${targetAppName} already exists`);
		process.exit(1);
	}

	if (!apps.find((a) => a.id == appToClone)) {
		console.log(`ERROR: App ${appToClone} does not exist`);
		process.exit(1);
	}

	// @ts-ignore
	return deis.getConfigDeprecated(appToClone).then((config) => {
		return deis.createApp(targetAppName).then(() => deis.setConfigDeprecated(targetAppName, config));
	});
});
