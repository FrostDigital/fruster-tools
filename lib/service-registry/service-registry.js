const utils = require("../utils");
const git = require("../git");
const conf = require("../../conf");
const path = require("path");
const spawn = require("../spawn");
const log = require("../log");
const template = require("es6-template-strings");

class ServiceRegistry {
    
    constructor(model, name, branch) {    
    	this.branch = branch || model.branch || "develop";
    	this.name = name || model.name;        
        this.services = model.services.map(service => {
            service.isDir = this.isDir(service);        
            service.workDir = service.isDir ? service.repo : this.getWorkdir(service);
            service.env = this.interpolateEnv(Object.assign({}, service.env, model.env));
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

            if(service.isDir) {
                return Promise.resolve();
            }

	    	if(git.isRepo(service.workDir)) {
	    		log.debug(`Repo exists, updating branch ${this.branch} in ${service.workDir}`);
                repoPromise = git.init(service.workDir)
                    .then(repo => git.pull(repo));
            } else {
                log.debug(`Cloning ${service.repo} into ${service.workDir}`);
                repoPromise = git.clone(service.repo, service.workDir);
            }                
        
            return repoPromise.then(repo => git.checkout(repo, service.branch || this.branch));
    	});

    	return Promise.all(promises);
    }

    // Build all services
    build(onData) {
        this.buildProcesses = this.services.map(service => {
            return spawn({
                name: service.name, 
                command: service.build, 
                cwd: service.workDir, 
                env: service.env, 
                onData: onData
            });
        });
    }

    whenAllBuilt() {
        return Promise.all(this.buildProcesses.map(p => p.exitPromise()));
    }

    // Start services, can be filtered with wildcard pattern
    start(onData) {
        this.startedProcesses = this.startedProcesses = this.services.map(service => {
            return spawn({
                name: service.name, 
                command: service.start, 
                cwd: service.workDir, 
                env: service.env, 
                onData: onData
            });
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

    isDir(service) {
        if(service.repo.indexOf("/") === 0) {
            if(!utils.hasDir(service.repo, true)) {
                throw "No such dir: " + service.repo;
            }
            return true;
        }
        return false;
    }

    interpolateEnv(env) {
        for(let k in env) {    
            if(typeof(env[k]) == "string" && env[k].includes("${")) {
                try {
                    env[k] = template(env[k], process.env);                    
                } catch(e) {
                    log.error(`Failed to interpolate string - missing env var(s) for config: "${env[k]}"`);
                    process.exit(1);
                }
            }
        }
        return env;
    }
}

module.exports = ServiceRegistry;
