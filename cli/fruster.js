#!/usr/bin/env node

var program = require("commander");

program
  .version("0.0.1")  
  .command("start <service-registry>", "start local fruster defined by service registry").alias("run")
  .command("logs <app>", "view logs of deis app").alias("log") 
  .command("config <config...>", "set/unset/get config for app(s)")  
  .command("use <cluster>", "switch kube and deis cluster").alias("switch")
  .command("add-deis-cluster <cluster>", "add deis cluster")  
  .command("port-forward <pod> <portMapping>", "port forward localhost to remote pod").alias("pf")
  .command("healthcheck", "set, get or unset healtcheck").alias("hc")  
  .command("clone <app> <clone-name>", "clone an app and its config")
  .command("generate-docs <service-registry>", "generate documentation for all service defined in service registry")
  .parse(process.argv);