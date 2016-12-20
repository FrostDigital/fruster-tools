#!/usr/bin/env node

var program = require("commander");

program
  .version("0.0.1")  
  .command("run <fruster>", "run local fruster").alias("start") 
  .command("logs <app>", "view logs of deis app").alias("log") 
  .command("config <config...>", "set/unset/get config for app(s)")  
  .parse(process.argv);