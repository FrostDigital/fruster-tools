#!/usr/bin/env node
const program = require("commander");

program
	.command("create", "create new deployment")
	.command("scale", "scale deployment")
	.description(
		`
Manage kubernetes deployments.
`
	)
	.parse(process.argv);
