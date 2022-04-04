#!/usr/bin/env node
import { program } from "commander";

program
	.command("get", "get config of a service")
	.command("set", "set config for a service")
	.command("unset", "remove config for a service")
	.description(
		`
Manage config for apps.
`
	)
	.parse(process.argv);
