#!/usr/bin/env node

const program = require('commander');
const deis = require('../lib/deis');
const kube = require('../lib/kube');
const log = require('../lib/log');

program    
  .description(
`
Start port forwarding to given pod. Pod can be entered with syntax "namespace@podname" and supports wildcard pattern.

Example:

# Forwards localhost port 44222 to pods 4222 for pod "nats-8hq2a" in namespace "paceup"
$ fruster port-forward nats-8hq2a@paceup 44222:4222

# Forwards localhost port 44222 to pods 4222 for any pod with name starting with nats
$ fruster port-forward nats* 44222:4222

`)
  .parse(process.argv);

const podName = getPodAndNamespace(program.args[0]);
const portMapping = program.args[1];

if(!podName || !portMapping) {
	log.error("Missing argument");
	return process.exit(1);
}

kube.getPods(podName.pod, podName.namespace)
  .then(pods => {    
  	if(pods.length > 1) {
  		log.error(`Found more than one pod with pattern ${podName}`);
  		return process.exit(1);
  	} else if(pods.length == 0) {
  		log.error(`Could not find any pod "${JSON.stringify(podName)}"`);
  		return process.exit(1);
  	}
  	return pods[0];
  })  
  .then(pod => kube.portForward(pod.metadata.namespace, pod.metadata.name, portMapping))
  .catch(err => log.error("Failed starting port forward"));

function getPodAndNamespace(podName) {
	let podAndNamespace = {
		pod: null,
		namespace: null
	};

	if(podName.indexOf("@") > 0) {
		const split = podName.split("@");
		podAndNamespace.pod = split[0];
		podAndNamespace.namespace = split[1];
	} else {
		podAndNamespace.pod = podName;
	}

	return podAndNamespace;
}