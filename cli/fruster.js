#!/usr/bin/env node

const program = require("commander");

program
	.version("0.0.1")
	.command("config", "set/unset/get config for app(s)")
	.command("create", "create deis apps defined in service registry")
	.command("scale", "scale number of replicas of a deployment")
	.command("apps", "list apps/services")
	.command("deis", "deprecated ")
	.alias("d")
	.parse(process.argv);
