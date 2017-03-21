#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');
const serviceRegistryFactory = require('../lib/service-registry');
const log = require("../lib/log");

program
  .description(
    `
Applies config from service registry. Any config changes will be set on active deis cluster.

Example:

# Set BUS on all apps with name that starts with "ag-"
$ fruster config apply frostdigital/paceup
`)
  .option("-f, --force", "override config if conflicts")
  .option("-p, --prune", "remove config from apps that is not defined in service registry")
  .option("-c, --create-apps", "create app(s) if non existing")
  .option("-d, --dry-run", "just check, no writing")
  .option("-e, --env-override", "pass current env to services")
  .parse(process.argv);

const serviceRegPath = program.args[0];
const createApps = program.createApps;
const dryRun = program.dryRun;
const prune = program.prune;
const envOverride = program.envOverride;

if (!serviceRegPath) {
  console.log("Missing service registry path");
  process.exit(1);
}

// Fetch all services their config in service registry
serviceRegistryFactory.create(serviceRegPath, { envOverride: envOverride }).then(serviceRegistry => {
  // Make sure all services has corresponding deis app
  // and create them if wanted
  return deis.apps()
    .then(apps => {
      let createAppsPromises = serviceRegistry.services.map(service => {
        
        if(!apps.find(app => app.id == service.name)) {          
          if(createApps) {
            console.log(`Creating app ${service.name}...`);            
            return dryRun ? Promise.resolve() : deis.createApp(service.name); 
          } else {
            console.log(`Service ${service.name} does not exist in deis, skipping config of this service`);
            service.skip = true;          
          }
        }
        return Promise.resolve();        
      });
      return Promise.all(createAppsPromises);
    })
    .then(() => {
      let services = serviceRegistry.services.filter(service => !service.skip);

      let changeSetPromises = services.map(service => {          
        
        return deis.getConfig(service.name).then(existingConfig => {
                   
          let changeSet = {};

          for(let k in existingConfig) {
            if(service.env[k] === undefined) {                
              if(prune) {
                log.warn(`[${service.name}] Will remove ${k} (value was "${existingConfig[k]}")`);
                changeSet[k] = null;
              } else {
                log.warn(`[${service.name}] App has config ${k} which is missing in service registry, use --prune to remove this, current value is "${existingConfig[k]}"`);
              }                
            }
            else if(existingConfig[k] != service.env[k]) {
              console.log(`[${service.name}] Updating ${k} ${existingConfig[k]} -> ${service.env[k]}`);
              changeSet[k] = service.env[k];
            }
          }

          for(let k in service.env) {
            if(existingConfig[k] === undefined) {
              console.log(`[${service.name}] New config ${k}=${service.env[k]}`);
              changeSet[k] = service.env[k];
            }
          }

          if(!Object.keys(changeSet).length) {            
            log.success(`[${service.name}] up to date`);
            changeSet = null;         
          } 

          return Promise.resolve({
            changeSet: changeSet,
            serviceName: service.name
          });          
        });
      });

      return Promise.all(changeSetPromises).then(changeSets => {
        // Note: Perform config in a sequence to not overload deis controller
        // http://stackoverflow.com/a/24586168/83592
        let p = Promise.resolve();

        changeSets.forEach(changeSet => {          
          p = p.then(() => {                         
            if(!dryRun && changeSet.changeSet) {
              console.log(`[${changeSet.serviceName}] Updating config...`);
              return deis.setConfig(changeSet.serviceName, changeSet.changeSet)
                .then(() => {
                  log.success(`[${changeSet.serviceName}] Done updating`);
                })
                .catch((err) => {
                  log.error(`[${changeSet.serviceName}] got error while updating config`);                  
                  console.log(err);
                });
            }
          });
        });
      });      
    });

})
.catch(err => {
  console.log(err);
  process.exit(1);
});