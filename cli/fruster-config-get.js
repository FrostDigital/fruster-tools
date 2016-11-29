#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');

program    
  .description(
`
Get config for app(s). Supports wildcard pattern on app name to get config for
multiple apps. 

Example:

$ fruster config get -a ag-*
`)
  .option("-a, --app <app name>", "Application name or pattern with wildcard")  
  .parse(process.argv);

const appName = program.app;

deis.apps(appName)
  .then(apps => {    
    return Promise.all(apps.map(app => deis.getConfig(app)));    
  })
  .then(outputs => {
    console.log(outputs.join("\n"));
  });