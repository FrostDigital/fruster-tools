#!/usr/bin/env node

const { program } = require("commander");

program
	.version("0.0.1")
	.command("apps", "list apps/services")
	.command("config", "set/unset/get config for app(s)")
	.command("create", "create deis apps defined in service registry")
	.command("deploy", "deploy new tag")
	.command("history", "show release history for an app")
	.alias("releases")
	.command("info", "show info about an app")
	.command("logs", "view logs for an app")
	.command("restart", "restart an app")
	.command("scale", "scale number of replicas of a deployment")
	.command("destroy", "removes an app")
	.command("deis", "deprecated ")
	.alias("d")
	.parse(process.argv);
