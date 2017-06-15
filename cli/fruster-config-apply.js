#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');
const serviceRegistryFactory = require('../lib/service-registry');
const log = require("../lib/log");
const Promise = require("bluebird");

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
  .option("-p, --pass-host-env", "pass current env to services")
  .option("-e, --environment <environment>", "prod|int|stg etc")
  .option("-h, --add-healthcheck", "adds healthchecks too all apps")
  .option("-p, --print", "print config to stdout")
  .parse(process.argv);

const serviceRegPath = program.args[0];
const createApps = program.createApps;
const dryRun = program.dryRun;
const prune = program.prune;
const passEnv = program.passHostEnv;
const environment = program.environment;
const addHealthcheck = program.addHealthcheck;

if (!serviceRegPath) {
  console.log("Missing service registry path");
  process.exit(1);
}

serviceRegistryFactory.create(serviceRegPath, { passHostEnv: passEnv, environment: environment }).then(serviceRegistry => {
  
  return deis.apps()
    .then(apps => {      
      return Promise.mapSeries(serviceRegistry.services, (service) => {

        let promise = Promise.resolve();

        if(!apps.find(app => app.id == service.name)) {          
          if(createApps) {
            console.log(`[${service.name}] Creating app ...`);            
            
            if(!dryRun) {
              promise.then(() => deis.createApp(service.name));
            }            
          } else {
            log.warn(`Service ${service.name} does not exist in deis, skipping config of this service`);
            service.skip = true;          
          }
        }
        
        if(addHealthcheck && !service.skip) {
          console.log(`[${service.name}] Enabling healthcheck`);
          
          if(!dryRun) {
            promise.then(() => deis.enableHealthcheck(service.name));            
          }          
        }

        return promise;
      });            
    })
    .then(() => {      
      let services = serviceRegistry.services.filter(service => !service.skip);

      if(program.print) {
        services.forEach(service => {
          console.log(service.name);
          
          Object.keys(service.env).sort().forEach(k => {
            console.log(k, "=", service.env[k]);                        
          });          

          console.log();
        });              
      }

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

      return Promise.all(changeSetPromises).mapSeries(changeSet => {       
        if(!dryRun && changeSet.changeSet) {
          console.log(`[${changeSet.serviceName}] Updating config...`);
          return deis.setConfig(changeSet.serviceName, changeSet.changeSet)
            .then(() => {
              log.success(`[${changeSet.serviceName}] Done updating`);
            })
            .catch((err) => {
              log.error(`[${changeSet.serviceName}] got error while updating config:\n${err.message}`);
            });
        }        
      });      
    });

})
.catch(err => {
  console.log(err);
  process.exit(1);
});