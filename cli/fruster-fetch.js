#!/usr/bin/env node

const program = require("commander");
const runner = require("../lib/runner");

program
	.option("-e, --environment <environment>", "prod|int|stg etc")
	.option(
		"--exclude <exclude>",
		"name of service that will not be started, separate with comma if multiple"
	)
	.option(
		"--dir <dir>",
		"directory where services are located, will default to ${FRUSTER_HOME}/${SERVICE REGISTRY NAME}"
	)
	.option("--verbose", "Verbose logging of build")
	.option("--branch <branch>", "git branch of services to start")
	.description(
		`
Fetch services defined in service registry. Will perform git clone or pull latest changes.

Example:

# Build fruster with services defined in github repo frostdigital/agada in file services.json
$ fruster fetch frostdigital/agada

# fetch fruster with services defined in github repo in branch develop
$ fruster fetch frostdigital/agada#develop

# fetch fruster with services defined in local file
$ fruster fetch ~/agada/services.json
`
	)
	.parse(process.argv);

const serviceRegPath = program.args[0];

if (!serviceRegPath) {
	console.error("ERROR: Missing name of fruster to start");
	process.exit(1);
}

runner.start(serviceRegPath, {
	environment: program.environment,
	verboseOutput: program.verbose,
	exclude: program.exclude,
	skipStart: true,
	skipBuild: true,
	workDir: program.dir,
	branch: program.branch
});
