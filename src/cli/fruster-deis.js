#!/usr/bin/env node
const { program } = require("commander");

program
	.command("config", "Manage deis app configuration")
	.command("healthcheck", "Manage healtcheck for services")
	.command("create-apps", "Create apps that are defined in service registry")
	.command("destroy-apps", "Destroy apps that are defined in service registry")
	.command("clone", "Clone an app")
	.description(
		`
Manage deis apps.
`
	)
	.parse(process.argv);
