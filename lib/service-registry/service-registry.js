const utils = require("../utils");
const git = require("../git");
const conf = require("../../conf");
const path = require("path");
const spawn = require("../spawn");
const log = require("../log");

class ServiceRegistry {
    
    constructor(model, name, branch = "develop") {    
    	this.branch = branch;
    	this.name = name || model.name;        
    	this.services = model.services.map(service => {
    		service.workDir = this.getWorkdir(service);
    		return service;
    	});
        this.buildProcesses = [];
        this.startedProcesses = [];
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
	    		log.debug(`Repo exists, updating branch ${this.branch} in ${service.workDir}`);
                repoPromise = git.init(service.workDir); // then update
            } else {
                log.debug("Cloning", service.repo, "into", service.workDir);
                repoPromise = git.clone(service.repo, service.workDir);
	    	}                
        
            return repoPromise.then(repo => git.checkout(repo, this.branch));
    	});

    	return Promise.all(promises);
    }

    // Build all services
    build() {
        this.buildProcesses = this.services.map(service => {
            return spawn(service.name, service.build, service.workDir, {});
        });
    }

    whenAllBuilt() {
        return Promise.all(this.buildProcesses.map(p => p.exitPromise()));
    }

    // Start services, can be filtered with wildcard pattern
    start(onData) {
        this.startedProcesses = this.startedProcesses = this.services.map(service => {
            return spawn(service.name, service.start, service.workDir, {}, onData);
        });   
    }

    // Kill all running processes, if any
    killAll() {
        [].concat(this.buildProcesses).concat(this.startedProcesses).forEach(p => {            
            p.kill();
        });
    }

    getWorkdir(service) {
    	return path.join(conf.frusterHome, this.name, service.name);
    }
}

module.exports = ServiceRegistry;
