#!/usr/bin/env node

const program = require('commander');
const runner = require("../lib/runner");

program    
  .option("-e, --environment <environment>", "prod|int|stg etc")
  .option("--exclude <exclude>", "name of service that will not be started, separate with comma if multiple")
  .option("--skip-update", "if update (clone/fetch) should be skipped")
  .option("--skip-build", "if build step of services should be skipped")
  .option("--verbose", "Verbose logging of build")
  .description(`
Start fruster locally. Will start all services defined in service registry that is either a
path or a git url or relative github path (org/repo).

Will choose default branch in git repo but can be specified by appending "#branchName".

Example:

# Start fruster with services defined in github repo frostdigital/agada in file services.json
$ fruster start frostdigital/agada

# Start fruster with services defined in github repo in branch develop 
$ fruster start frostdigital/agada#develop

# Start fruster with services defined in local file 
$ fruster start ~/agada/services.json
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
  skipUpdate: program.skipUpdate,
  skipBuild: program.skipBuild
});
