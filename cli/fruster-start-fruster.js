#!/usr/bin/env node

const program = require('commander');
// const kube = require('../lib/kube');
// const deis = require('../lib/deis');
const conf = require('../conf');
const runner = require("../lib/runner");

program    
  .option("--exclude", "Wildcard pattern of services to exclude")
  .option("--branch", "Branch to run develop|master")
  .description(`
Start fruster locally. Will start all services defined in service registry.

Example:

# Start fruster with services defined in github repo frostdigital/agada in file services.json
$ fruster start-fruster frostdigital/agada --branch develop

# Start fruster with services defined in local file but exclude api-gateway
$ fruster start-fruster ./agada.json --exclude "*api-g*"
`
  )
  .parse(process.argv);

const serviceRegPath = program.args[0];

if(!serviceRegPath) {
  console.error("ERROR: Missing name of fruster to start");
  process.exit(-1);
}

runner.start(serviceRegPath);

// let svcReg = require('../lib/service-registry').create(serviceRegPath);

// svcReg.cloneOrUpdateServices()
// 	.then(() => svcReg.build())
// 	.then(() => svcReg.start());
