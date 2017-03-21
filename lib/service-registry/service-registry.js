const utils = require("../utils");
const git = require("../git");
const conf = require("../../conf");
const path = require("path");
const spawn = require("../spawn");
const log = require("../log");
const template = require("es6-template-strings");

class ServiceRegistry {
    
    constructor(model, options={}/*name, branch, envOverride = {}*/) {    
    	this.branch = options.branch || model.branch || "develop";
    	this.name = options.name || model.name;        
        this.services = model.services.map(service => {
            service.isDir = this.isDir(service);        
            service.workDir = service.isDir ? service.repo : this.getWorkdir(service);
            service.env = this.interpolateEnv(Object.assign({}, service.env, model.env), options.envOverride);
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

    interpolateEnv(env, envOverride) {
        for(let k in env) {
            let envValue = env[k];

            if(envOverride && process.env[k]) {
                env[k] = process.env[k];                
            }        
            else if(typeof(envValue) == "string" && envValue.includes("${")) {
                try {
                    env[k] = template(envValue, process.env);                    
                } catch(e) {
                    log.error(`Failed to interpolate string - missing env var(s) for config: "${envValue}"`);
                    process.exit(1);
                }
            }
        }
        return env;
    }
}

module.exports = ServiceRegistry;
