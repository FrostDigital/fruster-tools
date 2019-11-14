#!/usr/bin/env node
const program = require("commander");

program
	.command("get <service name>", "get config of a service")
	.command("set <config...> <service name>", "set config for a service")
	.command("apply <service registry>", "set config from service registry")
	.description(
		`
Manage kubernetes service config.
`
	)
	.parse(process.argv);
