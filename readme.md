# Fruster Tools

A collection of commands that will make life with Deis and Kubernetes easier.

   Usage: fruster [options] [command]


   Commands:

     start|run <service-registry>         start local fruster defined by service registry
     logs|log <app>                       view logs of deis app
     config <config...>                   set/unset/get config for app(s)
     use|switch <cluster>                 switch kube and deis cluster
     add-deis-cluster <cluster>           add deis cluster
     port-forward|pf <pod> <portMapping>  port forward localhost to remote pod
     healthcheck|hc                       set, get or unset healtcheck
     help [cmd]                           display help for [cmd]

   Options:

     -h, --help     output usage information
     -V, --version  output the version number
   

## Prerequisites

You need the following installed:

* Kubectl
* deis cli
* git client setup with SSH key access to github
* [Clusters repo](https://github.com/FrostDigital/clusters) de-crypted in `~/.clusters` (default, but location can be changed with env var `CLUSTERS_HOME`)

## Installation

Install globally with npm:

    npm install -g frostdigital/fruster-tools

## Roadmap

* [TECH] Run tests in docker container where git, kube and deis is setup