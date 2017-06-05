#!/usr/bin/env node
const program = require('commander');

program  
  .command("set <config...>", "set config on app(s)") 
  .command("get", "get config of app(s)")    
  .command("create-apps", "create apps defined in service registry")    
  .command("unset", "remove config from app(s)").alias("remove")   
  .command("apply <registry>", "apply config from service registry")
  .description(
`
Manage application config. A more powerfull quivalent of "deis config".
`)
  .parse(process.argv);
