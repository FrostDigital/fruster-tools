const os = require("os");
const path = require("path");

module.exports = {
	frusterHome: process.env.FRUSTER_HOME || path.join(os.homedir(), ".fruster"),

	kubeHome: process.env.KUBE_HOME || path.join(os.homedir(), ".kube"),

	deisHome: process.env.DEIS_HOME || path.join(os.homedir(), ".deis"),

	clustersHome: process.env.CLUSTERS_HOME || path.join(os.homedir(), ".clusters"),

	kubeClientVersion: process.env.KUBE_CLIENT_VERSION || "1.13",
};
