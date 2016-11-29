#!/usr/bin/env node

const program = require('commander');
const kube = require('../lib/kube');
const deis = require('../lib/deis');

program  
  .option("-t, --tail", "Follow/tail logs")  
  .description(`
Show logs of app(s). Will get logs via kube instead of deis. 

Support wildcard pattern for app name.
`
)
  .parse(process.argv);

const appName = program.args[0];
const tail = program.tail;

if(!appName) {
  console.log("Missing app name or pattern");
  process.exit(-1);
}

if(appName.indexOf("*") > -1) {
  deis.apps(appName)
    .then(apps => Promise.all(apps.map(showLogs)));  
} else {
  showLogs(appName);
}

function showLogs(appName) {
  return kube.logs(appName, tail)
    .then(logOutput => {
      const header = `==========  ${appName}  ==========`;
      const separator = Array(header.length+1).join("=");      
      
      console.log("\n\n");
      console.log(separator);            
      console.log(header);
      console.log(separator);            
      console.log(logOutput);
    })
    .catch(console.err);  
}

