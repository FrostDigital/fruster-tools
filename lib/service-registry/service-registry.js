const utils = require("../utils");
const git = require("../git");
const conf = require("../../conf");
const path = require("path");

class ServiceRegistry {
    
    constructor(name, model, branch = "develop") {    
    	this.model = model;
    	this.branch = branch;
    	this.name = name || model.name;
    }

    // Get services, can be filtered
    getServices(pattern = "*") {
    	return this.model.services.filter(service => utils.matchPattern(service.name, pattern));
    }

 	// Clone all services repos or update if already cloned 
    cloneOrUpdateServices() {  

    	let promises = this.model.services.map(service => {
	    	const dir = this.getWorkdir(service);

	    	if(git.isRepo(dir)) {
	    		return git.init(dir); // then update
	    	} else {
	    		return git.clone(service.repo, dir, 1);
	    	}
    	});

    	return Promise.all(promises);
    }

    // Start services, can be filtered with wildcard pattern
    start(excludePattern) {


    }

    getWorkdir(service) {
    	return path.join(conf.frusterHome, this.name, service.name);
    }
}

module.exports = ServiceRegistry;
