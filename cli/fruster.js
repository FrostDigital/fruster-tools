#!/usr/bin/env node

var program = require("commander");

program
  .version("0.0.1")  
  .command("run <fruster>", "run local fruster").alias("start") 
  .command("logs <app>", "view logs of deis app").alias("log") 
  .command("config <config...>", "set config on app(s)")  
  .command("create deis", "an interactive guide to create and configure a version of Deis")  
  .parse(process.argv);