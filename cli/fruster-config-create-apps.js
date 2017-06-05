#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');
const serviceRegistryFactory = require('../lib/service-registry');
const log = require("../lib/log");
const Promise = require("bluebird");

program
  .description(
    `
Create apps defined in service registry. Will skip apps that already exists.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster config create-apps frostdigital/paceup
`)  
  .option("-d, --dry-run", "just check, no writing")  
  .option("-e, --environment <environment>", "prod|int|stg etc")
  .parse(process.argv);

const serviceRegPath = program.args[0];
const dryRun = program.dryRun;
const environment = program.environment;

if (!serviceRegPath) {
  console.log("Missing service registry path");
  process.exit(1);
}

serviceRegistryFactory.create(serviceRegPath, { environment: environment }).then(serviceRegistry => {
  
  return deis.apps()
    .then(apps => {      
      return Promise.mapSeries(serviceRegistry.services, (service) => {
        let promise = Promise.resolve();

        if(!apps.find(app => app.id == service.name)) {                  
          log.info(`[${service.name}] Creating app ...`);            
          
          if(!dryRun) {
            promise.then(() => deis.createApp(service.name));
          }            
       
        } else {
          log.success(`[${service.name}] Already exists`);
        }
  
        return promise;
      });            
    });
})
.catch(err => {
  console.log(err);
  process.exit(1);
});