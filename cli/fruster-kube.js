#!/usr/bin/env node
const program = require("commander");

program
	.command("config apply", "set config on deployment")
	.command("create deployment <service registry>", "create deployment")
	.description(
		`
Manage services deployed to kubernetes.
`
	)
	.parse(process.argv);
