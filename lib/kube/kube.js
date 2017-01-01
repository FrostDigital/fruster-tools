const cmd = require("../cmd");
const utils = require("../utils");
const spawn = require("../spawn");
const log = require("../log");

let kube = {};

module.exports = kube;

kube.clusterInfo = () => { 
  return invokeKubeCmd(null, "cluster-info");
};

kube.logs = (namespace, tail) => {   
  // Get alls pods in app namespace
  return invokeKubeCmd(namespace, "get po", true)
    .then(res => {

      if(res.items.length) {
        // Find first pod in phase "Running"
        let pod = res.items.find(item => {          
          return item.status.phase == "Running";
        });          

        if(!pod) {
          // TODO: Fallback on pod with other state, maybe "ContainerCreating" is more interesting?
          // Fallback to first pods log
          pod = res.items[0];
          log.warn("WARN: Showing logs for non running pod, phases is", pod.status.phase);
        }
          
        if(tail) {
          log.error(
`ERROR: Tail is not yet implemented, in the meantime you may run this command:

$ kubectl --namespace=${namespace} logs ${pod.metadata.name} -f`
);
          throw new Error("Tail not supported");
        }


        return pod;
      } else {
        throw new Error(`No such app ${namespace}`);
      }

    })
    .then(pod => invokeKubeCmd(namespace, `logs ${pod.metadata.name} --tail=500`));
};

kube.getPods = (podNamePattern, namespace) => {
  return invokeKubeCmd(!namespace ? "all" : namespace, `get pods`, true).then(resp => {
      return resp.items.filter(pod => {        
        return utils.matchPattern(pod.metadata.name, podNamePattern)
      });
  });
};

kube.portForward = (namespace, pod, portMapping) => {
  const spawnProcessName = `Port forward ${namespace}@${pod} ${portMapping}`;
  const command = `kubectl --namespace=${namespace} port-forward ${pod} ${portMapping}`;

  function onData(msg) {
    log.info(msg.data);
  }

  log.info("Starting port forwarding, press ctrl+c to exit");
  
  return spawn({
    name: spawnProcessName,
    command: command,
    onData: onData,
    inheritEnv: true
  }).exitPromise();  
};

function invokeKubeCmd(namespace, command, json) {
  let allNamespaces = "";
  
  if(namespace == "all") {
    allNamespaces = "--all-namespaces";
    namespace = null;
  }

  return cmd(`kubectl ${json ? "-o json" : ""} ${namespace ? "--namespace=" + namespace : ""} ${command} ${allNamespaces}`)
    .then(res => {
      return json ? JSON.parse(res) : res;
    });
}