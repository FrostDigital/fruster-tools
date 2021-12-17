#!/usr/bin/env node
const { program } = require("commander");

program
	.command("apply", "apply config from service registry")
	.command("get", "get config of a service")
	.command("set", "set config for a service")
	.command("unset", "remove config for a service")
	.description(
		`
Manage kubernetes service config.
`
	)
	.parse(process.argv);
