#!/usr/bin/env node

const program = require('commander');
const kube = require('../lib/kube');
const deis = require('../lib/deis');

program
  .option("-t, --tail", "Follow/tail logs")
  .description(`
Show logs of app(s). Will get logs via kube instead of deis. 

Supports wildcard pattern for app name.

Examples:

$ fruster logs "ag-api-g*"
$ fruster logs ag-api-gateway
`)
  .parse(process.argv);

const appName = program.args[0];
const tail = program.tail;

if (!appName) {
  console.log("Missing app name or pattern");
  process.exit(-1);
}

deis.apps(appName)
  .then(apps => Promise.all(apps.map(showLogs)));


function showLogs(app) {
  return kube.logs(app.id, tail)
    .catch(console.err);
}