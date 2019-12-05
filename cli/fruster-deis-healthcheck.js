#!/usr/bin/env node
const program = require("commander");

program
	.command("set <app>", "enable health check for app(s)")
	.command("get <app>", "get health check for app(s)")
	.command("unset <app>", "remove healthcheck for app(s)")
	.alias("remove")
	.description(
		`
Manage liveness health checks. Will set health check that is compatible
with fruster-health https://github.com/FrostDigital/fruster-health-js).
`
	)
	.parse(process.argv);
