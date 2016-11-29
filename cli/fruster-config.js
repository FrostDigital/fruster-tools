#!/usr/bin/env node
const program = require('commander');

program  
  .command("set <config...>", "set config on app(s)") 
  .command("get", "get config of app(s)")    
  .command("unset", "remove config from app(s)").alias("remove")   
  .description(
`
Manage application config. A more powerfull quivalent of "deis config".
`)
  .parse(process.argv);
