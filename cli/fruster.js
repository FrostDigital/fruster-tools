#!/usr/bin/env node

const program = require("commander");

program
	.version("0.0.1")
	.command("logs <app>", "view logs of deis app")
	.alias("log")
	.command("config <config...>", "set/unset/get config for app(s)")
	.command("create-apps <registry>", "create deis apps defined in service registry")
	.command("kube", "manage services in kubernetes")
	.alias("k")
	.command("destroy-apps <registry>", "destroy deis apps defined in service registry")
	.command("healthcheck", "set, get or unset healtcheck on deis app")
	.alias("hc")
	.command("clone <app> <clone-name>", "clone an deis app and its config")
	.parse(process.argv);
