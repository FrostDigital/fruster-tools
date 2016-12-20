const utils = require("../utils");
const git = require("../git");
const conf = require("../../conf");
const path = require("path");
const spawn = require("../spawn");

class ServiceRegistry {
    
    constructor(model, name, branch = "develop") {    
    	this.branch = branch;
    	this.name = name || model.name;
    	this.services = model.services.map(service => {
    		service.workDir = this.getWorkdir(service);
    		return service;
    	});
    }

    // Get services, can be filtered
    getServices(pattern = "*") {
    	return this.services.filter(service => utils.matchPattern(service.name, pattern));
    }

 	// Clone all services repos or update if already cloned 
    cloneOrUpdateServices() {  

    	let promises = this.services.map(service => {

            let repoPromise;

	    	if(git.isRepo(service.workDir)) {
	    		console.log(`Repo exists, updating branch ${this.branch} in ${service.workDir}`);
                repoPromise = git.init(service.workDir); // then update
            } else {
                console.log("Cloning", service.repo, "into", service.workDir);
                repoPromise = git.clone(service.repo, service.workDir);
	    	}                
        
            return repoPromise.then(repo => git.checkout(repo, this.branch));
    	});

    	return Promise.all(promises);
    }

    // Build all services
    build() {

        let promises = this.services.map(service => {

            function onData(data) {
                console.log(service.name, data);
            }

            function onError(data) {
                console.log(service.name, "ERROR", data);
            }

            console.log(`Building ${service.name}...`);

            return spawn(service.build, {}, service.workDir, onData, onError);
        });
        
        return Promise.all(promises);
    }

    // Start services, can be filtered with wildcard pattern
    start(excludePattern) {

        let promises = this.services.map(service => {

            function onData(data) {
                console.log(service.name, data);
            }

            function onError(data) {
                console.log(service.name, /*"ERROR",*/ data);
            }

            console.log(`Starting ${service.name}...`);

            return spawn(service.start, {}, service.workDir, onData, onError)
                .catch(err => {
                    console.log("Failed to start service", service.name);
                });
        });
        
        return Promise.all(promises);       
    }

    getWorkdir(service) {
    	return path.join(conf.frusterHome, this.name, service.name);
    }
}

module.exports = ServiceRegistry;
