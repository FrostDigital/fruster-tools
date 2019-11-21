#!/usr/bin/env node
const program = require("commander");

program
	.command("deployment", "Manage deployments of services")
	.alias("d")
	.command("config <service name>", "Manage config for services")
	.description(
		`
Manage kubernetes resources.
`
	)
	.parse(process.argv);
