# `fruster` cli with kubernetes

Historically Fruster has been used with `deis` but since deis basically shutdown and kubernetes are getting more and more interesting features in itself we are about to move to use kubernetes directly.

> Note: All old commands are still there but prefixed `fruster deis <command>`.


## User guide

## Create services from registry

```
fruster create services.json
```

This command will create the following kubernetes resources related to each service defined in service registry:

* A kubernetes [deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
* A kubernetes service, if service is `routable`
* A kubernetes [secret](https://kubernetes.io/docs/concepts/configuration/secret/) which holds the service's configuration (env vars)
* Will validate that service registry secret exists, and if not copy it to the service registries namespace

The `image` and `imageTag` defined in each service configuration in service registry will be deployed. Note that
This command will create and configure a kubernetes deployment with configuration specified in the service registry. It will use `image` provided in service registry.

A kubernetes service will be created if service has `routable: true` in configuration. This will add annotations so the router and route TCP trafic the service.

## Get configuration

```
fruster config get <service name>
```

Will output service configuration similar to how `deis config -a...` works.

## Apply configuration from service registry

```
fruster config apply services.json
```

Applies config from service registry. This command can be used as a swiss-army knife and also create and recreate service from service registry:

```
fruster config apply services.json --create
```

This command will do same thing as `fruster create services.json`.

At some points it is needed to recreate service, for example if healthchecks, domains or resource limits has been changed

```
fruster config apply services.json --recreate
```

## Scale deployment

```
fruster scale -a api-gateway --replicas 2
```

Scales the kubernetes deployment for api-gateway to two replicas.

## Set configuration

```
fruster config set <config...> <service name>
```

Configuration should mostly be set by using `fruster kube config apply` so it is in sync with service registry, but at some occasions you might want to set a single configuration, ie. for test purposes.


## Migration guide

Update services in service registry to have following values:

* `image`
* `imageTag`
* `routable` if app listens for HTTP
* `domains` transfer domains listed in `deis domains -a ...` to here
* `livenessHealthCheck` if needed to
* `resources` if needed to

This is optional, but you should also remove deprecated fields `build, start, test` which are not needed anymore.

Check `service-registry-schema.js` for more details about fields above.

Since all services now runs in same namespace the internal DNS name for each service has changed. It was previously something like `pu-api-gateway.pu-api-gateway` but it is now `pu-api-gateway.paceup` {app name}.{namespace}. This is not widely used, but if it is this needs to be changed.
