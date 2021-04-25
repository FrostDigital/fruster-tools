#!/usr/bin/env node
const program = require("commander");

program
	.command("set <config...>", "set config on app(s)")
	.command("get", "get config of app(s)")
	.command("unset", "remove config from app(s)")
	.alias("remove")
	.command("apply <registry>", "apply config from service registry")
	.description(
		`
Manage application config. A more powerfull equivalent of "deis config".
`
	)
	.parse(process.argv);
