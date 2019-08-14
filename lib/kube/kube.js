const cmd = require("../cmd");
const utils = require("../utils");
const spawn = require("../spawn");
const log = require("../log");
const uuid = require("uuid");

let kube = {};

module.exports = kube;

kube.clusterInfo = () => {
	return invokeKubeCmd(null, "cluster-info");
};

kube.logs = (namespace, tail) => {
	return kube
		.getPods("*", namespace)
		.then(pods => {
			if (pods.length) {
				let pod = pods.find(item => {
					return item.status.phase == "Running";
				});

				if (!pod) {
					pod = pods[0];
					log.warn("WARN: Showing logs for non running pod, phases is", pod.status.phase);
				}
				return pod;
			} else {
				throw new Error(`No such app ${namespace}`);
			}
		})
		.then(pod =>
			spawnKubeCmd(
				`kubectl --namespace=${namespace} logs ${pod.metadata.name} ${tail ? "-f --tail=1" : "--tail=10500"}`,
				msg => {
					// Note: For some reason it (kube?) outputs "GOT:   311", avoid printing that
					if (msg.data.indexOf("GOT:") !== 0) log.info(msg.data);
				}
			)
		);
};

kube.getPods = (podNamePattern, namespace) => {
	return invokeKubeCmd(!namespace ? "all" : namespace, `get pods`, true).then(resp => {
		return resp.items.filter(pod => {
			return utils.matchPattern(pod.metadata.name, podNamePattern);
		});
	});
};

kube.portForward = (namespace, pod, portMapping) => {
	log.info("Starting port forwarding, press ctrl+c to exit");

	return spawnKubeCmd(`kubectl --namespace=${namespace} port-forward ${pod} ${portMapping}`, msg => {
		log.info(msg.data);
	});
};

function spawnKubeCmd(command, onData) {
	return spawn({
		name: uuid.v4(),
		command: command,
		onData: onData,
		inheritEnv: true
	}).exitPromise();
}

function invokeKubeCmd(namespace, command, json) {
	let allNamespaces = "";

	if (namespace == "all") {
		allNamespaces = "--all-namespaces";
		namespace = null;
	}

	return cmd(
		`kubectl ${json ? "-o json" : ""} ${namespace ? "--namespace=" + namespace : ""} ${command} ${allNamespaces}`
	).then(res => {
		return json ? JSON.parse(res) : res;
	});
}
