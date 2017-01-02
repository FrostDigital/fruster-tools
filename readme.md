# Fruster Tools

A collection of commands that will make life with Deis and Kubernetes easier.

    Usage: fruster [options] [command]
  
  
    Commands:
  
      start <service-registry>          start local fruster defined by service registry
      logs|log <app>                    view logs of deis app
      config <config...>                set/unset/get config for app(s)
      use|switch <cluster>              switch kube and deis cluster
      add-deis-cluster <cluster>        add deis cluster
      port-forward <pod> <portMapping>  port forward localhost to remote pod
      help [cmd]                        display help for [cmd]
  
    Options:
  
      -h, --help     output usage information
      -V, --version  output the version number
  

## Installation

    npm install -g frostdigital/fruster-tools
