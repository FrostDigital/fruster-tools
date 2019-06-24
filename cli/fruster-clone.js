#!/usr/bin/env node
const program = require("commander");
const deis = require("../lib/deis");

program
	.option(
		"-r, --create-remote",
		"Creates an git remote with same name as service name"
	)
	.description(
		`
Clone an existing deis app and its configuration. Will not clone any release.
`
	)
	.parse(process.argv);

async function clone(appToClone, targetAppName) {
	const apps = await deis.apps("*");

	if (apps.find(a => a.id == targetAppName)) {
		console.log(`ERROR: App named ${targetAppName} already exists`);
		process.exit(1);
	}

	if (!apps.find(a => a.id == appToClone)) {
		console.log(`ERROR: App ${appToClone} does not exist`);
		process.exit(1);
	}

	const config = await deis.getConfig(appToClone);

	// TODO: Clone limits
	// TODO: Clone healthchecks

	await deis.createApp({ appName: targetAppName });
	await deis.setConfig(targetAppName, config);
}

clone(program.args[0], program.args[1]);
