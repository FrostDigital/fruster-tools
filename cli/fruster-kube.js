#!/usr/bin/env node
const program = require("commander");

program
	.command("deployment", "Manage deployments")
	.alias("d")
	.command("config <service name>", "Get config for service")
	.description(
		`
Manage kubernetes resources.
`
	)
	.parse(process.argv);
