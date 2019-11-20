#!/usr/bin/env node

const program = require("commander");

program
	.version("0.0.1")
	.command("start <service-registry>", "start local fruster defined by service registry")
	.alias("run")
	.command(
		"start-box <service-registry> <image>",
		"start fruster defined by service registry using an existing docker image where all services and dependencies exists"
	)
	.alias("run-box")
	.command("build <service-registry>", "build services defined in service registry")
	.command("fetch <service-registry>", "fetch services defined in service registry")
	.command("logs <app>", "view logs of deis app")
	.alias("log")
	.command("config <config...>", "set/unset/get config for app(s)")
	.command("create-apps <registry>", "create apps defined in service registry")
	// .command("create-deployment <registry>", "create kubernetes deployment defined in service registry")
	.command("kube", "manage services in kubernetes")
	.alias("k")
	.command("destroy-apps <registry>", "destroy apps defined in service registry")
	.command("use <cluster>", "switch kube and deis cluster")
	.alias("switch")
	.command("add-deis-cluster <cluster>", "add deis cluster")
	.command("healthcheck", "set, get or unset healtcheck")
	.alias("hc")
	.command("clone <app> <clone-name>", "clone an app and its config")
	.parse(process.argv);
