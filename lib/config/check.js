module.exports = function(opts) {

	if(opts.deis) {
		checkDeis(opts.verbose);
	}

	if(opts.kube) {
		checkKube(opts.verbose);
	}

	if(opts.clusters) {
		checkClusters(opts.verbose);
	}

};

function checkDeis() {
	return true;
}

function checkKube() {
	return true;
}

function checkClusters() {
	return true;
}
