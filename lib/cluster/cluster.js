const conf = require("../../conf");
const fs = require("fs-extra");
const path = require("path");
const utils = require("../utils");
const deis = require("../deis");
const log = require("../log");

module.exports = {
	use: use,
	checkDeisConfig: checkDeisConfig,
	checkKubeConfig: checkKubeConfig,
	addDeisCluster: addDeisCluster
};

function use(cluster) {
	try {
		checkKubeConfig(cluster);		
		setKubeConfig(cluster);
	} catch(err) {
		log.warn("Failed changing kube config:\n" + err);
	}

	try {
		checkDeisConfig(cluster);
		setDeisConfig(cluster);		
	} catch(err) {
		log.warn("Failed changing deis config:\n" + err);
	}
}

function setKubeConfig(cluster) {	
	const clusterPath = path.join(conf.clustersHome, cluster, "kube"); 
	const credentialsPath = path.join(clusterPath, "credentials"); 
	const kubeConfigPath = path.join(clusterPath, "kubeconfig");	
	const kubeConfigTargetPath = path.join(conf.kubeHome, "config");
	const credentialsTargetPath = path.join(conf.kubeHome, "credentials");

	removeAndCreateBackup(kubeConfigTargetPath);
	fs.removeSync(kubeConfigTargetPath);
	fs.ensureSymlinkSync(kubeConfigPath, kubeConfigTargetPath);
	log.info(`Linked ${kubeConfigPath} -> ${kubeConfigTargetPath}`);	


	if(fs.existsSync(credentialsPath)) {
		removeAndCreateBackup(credentialsTargetPath);
		fs.removeSync(credentialsTargetPath);
		fs.ensureSymlinkSync(credentialsPath, credentialsTargetPath);
		log.info(`Linked ${credentialsPath} -> ${credentialsTargetPath}`);	
	}
}

function setDeisConfig(cluster) {
	const deisConfigTargetPath = path.join(conf.deisHome, "client.json");
	const deisClusterConfigPath = path.join(conf.frusterHome, "deis", `${cluster.toLowerCase()}.json`); 
	
	// Note: The cluster config will be copied to active.json which in turn is symlinked
	// to ${DEIS_HOME}/client.json so that, if deis CLI writes to client.json (such as when running `deis login`) 
	// the cluster master `deisClusterConfigPath` above will remain intact.
	const activeDeisConfigPath = path.join(conf.frusterHome, "deis", "active.json");

	removeAndCreateBackup(deisConfigTargetPath);

	fs.copySync(deisClusterConfigPath, activeDeisConfigPath);

	fs.removeSync(deisConfigTargetPath);
	
	fs.ensureSymlinkSync(activeDeisConfigPath, deisConfigTargetPath);
	
	log.info(`Linked ${activeDeisConfigPath} -> ${deisConfigTargetPath}`);	
}

function checkKubeConfig(cluster) {
	const clusterPath = path.join(conf.clustersHome, cluster, "kube"); 
	//const credentialsPath = path.join(clusterPath, "credentials"); 
	const kubeConfigPath = path.join(clusterPath, "kubeconfig");

	if(!utils.hasDir(conf.kubeHome)) {
		throw new Error(`Kube home directory does not exist (${conf.kubeHome})`);
	}
	if(!utils.hasFile(kubeConfigPath)) {
		throw new Error(`Cloud not find kubeconfig for ${cluster} at path ${kubeConfigPath}`);
	}
	// if(!utils.hasDir(credentialsPath)) {
	// 	throw new Error(`Cloud not find cluster credentials for ${cluster} at path ${credentialsPath}`);
	// }
}

function checkDeisConfig(cluster) {
	const deisClusterConfigPath = path.join(conf.frusterHome, "deis", `${cluster.toLowerCase()}.json`); 
	
	if(!utils.hasFile(deisClusterConfigPath)) {
		throw new Error(`Cloud not find deis cluster config for ${cluster} at path ${deisClusterConfigPath}`);
	}

	if(!utils.hasDir(conf.deisHome)) {
		throw new Error(`Cloud not find deis home at path ${conf.deisHome}`);
	}
}

function addDeisCluster(cluster, username, password, url) {
	const deisConfigPath = path.join(conf.frusterHome, "deis", cluster.toLowerCase() + ".json");
	return deis.login(url, username, password).then(loginObj => {
		console.log(loginObj);
		fs.outputJSONSync(deisConfigPath, loginObj);
	});
}

function removeAndCreateBackup(filePath) {
	if(utils.hasFile(filePath)) {
		fs.copySync(filePath, filePath + ".bkp");
		fs.removeSync(filePath);
	}
}