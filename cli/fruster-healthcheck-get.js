#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');
const log = require('../lib/log');

program    
  .description(
`
Get health checks for app(s).

Example:

# Get healthchecks for all services with names starting with "pu"
$ fruster healthcheck set pu-*
`)
  .parse(process.argv);

const appName = program.args[0];

if(!appName) {
  log.error("Missing app name or pattern");
  process.exit(1);
}

deis.apps(appName)
  .then(apps => {
    console.log(`Retrieving healthchecks for ${apps.length} app(s)...`);
    return Promise.all(apps.map(app => deis.getHealthcheck(app.id)));    
  })
  .then(outputs => {
    console.log(outputs.join("\n"));
  });
//   .then(() => {
//     console.log(`
// Done - health check is currently being updated. 
// You can view health check(s) with command:

// $ fruster healthcheck get "${appName}"`);
//   });