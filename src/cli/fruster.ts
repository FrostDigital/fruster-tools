#!/usr/bin/env node

import { program } from "commander";
import { start } from "../interactive/fruster-interactive";

program
	.action(start)
	.version("0.0.1")
	.command("apps", "list apps/services")
	.command("config", "set/unset/get config for app(s)")
	.command("create", "create a single apps or multiple apps defined in service registry")
	.command("deploy", "deploy new image tag")
	.command("history", "show release history for an app")
	.alias("releases")
	.command("info", "show info about an app")
	.command("logs", "view logs for an app")
	.command("restart", "restart an app")
	.command("scale", "scale number of replicas of a deployment")
	.command("destroy", "removes an app")
	.alias("delete")
	.parse(process.argv);
