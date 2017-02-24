#!/usr/bin/env node
const program = require('commander');
const docGenerator = require('../lib/doc-generator');

program    
  //.option("--template", "Custom template")  
  .description(
`
Generate service docs and REST API docs based on yaml files that are defined in all services repos.
`)
  .parse(process.argv);

const serviceRegPath = program.args[0];
const destinationPath = program.args[1];

if(!serviceRegPath) {
  console.error("ERROR: Missing service registry");
  process.exit(1);
}

docGenerator.generate(serviceRegPath, destinationPath)
	.catch(err => {
		console.log(err);
		process.exit(1);
	});