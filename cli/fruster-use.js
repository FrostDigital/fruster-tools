#!/usr/bin/env node

const program = require("commander");
const cluster = require("../lib/cluster");
const log = require("../lib/log");
const kube = require("../lib/kube");
const deis = require("../lib/deis");

program
	.description(
		`
Set which cluster to use. Will change so that kubernetes (~/.kube) and deis (~/.deis) points to this cluster.

Example:

$ fruster use c1
`
	)
	.parse(process.argv);

const clusterName = program.args[0];

if (!clusterName) {
	console.error("ERROR: Missing name of cluster to use");
	process.exit(1);
}

cluster.use(clusterName);

kube.clusterInfo()
	.then(log.info)
	.then(deis.whoami)
	.then(log.info);
