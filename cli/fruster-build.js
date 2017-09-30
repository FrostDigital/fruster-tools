#!/usr/bin/env node

const program = require('commander');
const runner = require("../lib/runner");

program    
  .option("-e, --environment <environment>", "prod|int|stg etc")
  .option("--exclude <exclude>", "name of service that will not be started, separate with comma if multiple")
  .option("--dir <dir>", "directory where services are located, will default to ${FRUSTER_HOME}/${SERVICE REGISTRY NAME}")
  .option("--verbose", "Verbose logging of build")
  .description(`
Build services defined in service registry.

Example:

# Build fruster with services defined in github repo frostdigital/agada in file services.json
$ fruster build frostdigital/agada

# Build fruster with services defined in github repo in branch develop 
$ fruster build frostdigital/agada#develop

# Build fruster with services defined in local file 
$ fruster build ~/agada/services.json
`
  )
  .parse(process.argv);

const serviceRegPath = program.args[0];

if(!serviceRegPath) {
  console.error("ERROR: Missing name of fruster to start");
  process.exit(1);
}

runner.start(serviceRegPath, { 
	environment: program.environment,
	verbose: program.verbose,
	exclude: program.exclude,
	skipUpdate: true,
	skipStart: true,
	workDir: program.dir 
});
