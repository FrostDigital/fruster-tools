#!/usr/bin/env node

const program = require('commander');
const kube = require('../lib/kube');
const deis = require('../lib/deis');
const conf = require('../conf');

program    
  .description(`
  	SUPER EXPERIMENTAL!!!
Runs fruster locally. Will start services defined in local service registry in fruster home (${conf.frusterHome}).
`
  )
  .parse(process.argv);

const frusterName = program.args[0];

if(!frusterName) {
  console.error("ERROR: Missing name of fruster to start");
  process.exit(-1);
}
