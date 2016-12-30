const cmd = require("../cmd");

let kube = {};

module.exports = kube;

kube.clusterInfo = () => { 
  return invokeKube(null, "cluster-info");
};

kube.logs = (namespace, tail) => { 
  
  // TODO: Use https://github.com/johanhaleby/kubetail
  
  // Get alls pods in app namespace
  return invokeKube(namespace, "get po", true)
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
          console.log("WARN: Showing logs for non running pod, phases is", pod.status.phase);
        }
          
        if(tail) {
          console.error(
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
    .then(pod => invokeKube(namespace, `logs ${pod.metadata.name} --tail=500`));
};


function invokeKube(namespace, command, json) {
  return cmd(`kubectl ${json ? "-o json" : ""} ${namespace ? "--namespace=" + namespace : ""} ${command}`)
    .then(res => {
      return json ? JSON.parse(res) : res;
    });
}