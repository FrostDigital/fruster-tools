#!/usr/bin/env node
const program = require("commander");

program
	.alias("d")
	.command("create", "create new deployment")
	.command("scale", "scale deployment")
	.description(
		`
Manage kubernetes deployments.
`
	)
	.parse(process.argv);
