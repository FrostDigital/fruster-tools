#!/usr/bin/env node

const program = require("commander");
//const deis = require("commander");

program  
  .option("--username [username]", "Deis username")
  .option("--password [password]", "Deis password")
  .option("--name [cluster name]", "Name of cluster, your choice but needs to be unique, example c1")   
  .option("--url [deis controller url]", "URL to deis controller, example http://deis.c1.fruster.se")
  .parse(process.argv);


// const registryRepo = program.args[0]; 
// const branch = program.args[1] || 'master';

// if(program.verbose) {
//   log.enableDebug();  
// }

// var app = new FrusterApp(registryRepo, branch);

// app.updateRegistry()
//   .then(() => app.updateServices())
//   .then(() => app.build(program.exclude))
//   .catch(log.error);

