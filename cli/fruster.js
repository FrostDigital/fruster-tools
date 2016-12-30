#!/usr/bin/env node

var program = require("commander");

program
  .version("0.0.1")  
  .command("start <service-registry>", "start local fruster defined by service registry")
  .command("logs <app>", "view logs of deis app").alias("log") 
  .command("config <config...>", "set/unset/get config for app(s)")  
  .command("use <cluster>", "switch kube and deis cluster").alias("switch")
  .command("add-deis-cluster <cluster>", "configure deis cluster")  
  .parse(process.argv);