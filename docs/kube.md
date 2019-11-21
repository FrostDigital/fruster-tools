# `fruster` with kubernetes

Historically Fruster has been used with `deis` but since deis basically shutdown and kubernetes are getting more and more interesting features in itself we are about to move to use kubernetes directly.

> Note: As now all commands are prefixed `fruster kube <command>` kind of like a feature flag, but it future `kube` prefix will be removed.

## Create and configure services from service registry

```
fruster kube deployment create <service registry>
```

This command will create and configure a kubernetes deployment with configuration specified in the service registry. It will use `image` provided in service registry.

A kubernetes service will be created if service has `routable: true` in configuration. This will add annotations so the router and route TCP trafic the service.

## Get configuration

```
fruster kube get config <service name>
```

Will output service configuration similar to how `deis config -a...` works.

## Apply configuration from service registry

```
fruster kube config apply <service registry>
```

Applies config from service registry.

## Set configuration

```
fruster kube config set <config...> <service name>
```

Configuration should mostly be set by using `fruster kube config apply` so it is in sync with service registry, but at some occasions you might want to set a single configuration, ie. for test purposes.
