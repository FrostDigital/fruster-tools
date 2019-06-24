#!/usr/bin/env node
const program = require("commander");

program
	.command("set <config...>", "set limit on app(s)")
	.command("get", "get limt of app(s)")
	.command("unset", "remove limit from app(s)")
	.alias("remove")
	.command("apply <registry>", "apply config from service registry")
	.description(
		`
Set limits on application.
`
	)
	.parse(process.argv);
