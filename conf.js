const os = require("os");
const path = require("path");

module.exports = {
  
  frusterHome: process.env.FRUSTER_DIR || path.join(os.homedir(), ".fruster"),

  kubeHome: ".kube"

};