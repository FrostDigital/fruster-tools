const spawn = require('child_process').spawn;

module.exports = function(opts) {
	return new Spawned(opts);
};

class Spawned {

	constructor(opts) {
		this.name = opts.name;
		this.command = opts.command;
		this.cwd = opts.cwd || process.cwd();		
		this.inheritEnv = opts.inheritEnv; 
		this.env = opts.env;		
		this.exitCode = null;
		this.output = [];
		this.childProcess = this.createChildProcess();
		this.onData = opts.onData;
	}

	createChildProcess() {
		const parsedCommand = parseCommand(this.command);

		let childProcess = spawn(parsedCommand.command, parsedCommand.args, {
			env: this.createEnv(),			
			cwd: this.cwd			
		});		

		if(childProcess) {			
			childProcess.stdout.on('data', (data) => { 
				this.onChildProcessData(data, "stdout");
			});
			childProcess.stderr.on('data', (data) => {
				this.onChildProcessData(data, "stderr");				
			});			
					
			childProcess.on('exit', (exitCode) => this.onChildProcessExit(exitCode));			
		}

		return childProcess;		
	}

	onChildProcessData(data, outputType) {		
		const msg = {
			date: new Date(),
			type: outputType,			
			data: data.toString(), //.replace(/\n/g,""),
			processName: this.name
		};

		this.output.push(msg);

		if(this.onData) {
			this.onData(msg);
		}
	}

	onChildProcessExit(exitCode) {	
		// For some reason exitCode argument is null when programmatically killing child process
		// TODO: Find out how this works
		this.exitCode = exitCode == null ? 0 : exitCode;
	}

	kill() {
		this.childProcess.kill();
	}

	exitPromise() {
		return new Promise((resolve, reject) => {

			function resolveOrReject(exitCode) {
				return exitCode == 0 ? resolve() : reject(exitCode);
			}

			if(this.exitCode != null) {
				return resolveOrReject(this.exitCode);
			} else {
				this.childProcess.on('exit', (exitCode) => resolveOrReject(exitCode));
			}
		}); 
	}

	createEnv() {	
		let parentEnv = {};
		if(this.inheritEnv) {
			parentEnv = process.env;
		} else {
			// we need PATH from parent env
			parentEnv.PATH = process.env.PATH;
		}
		return Object.assign({}, parentEnv, this.env);
	}
}

function parseCommand(command) {
  var split = command.split(' ');
  var args = [];  

  if(split.length > 0) {
    args = split.slice(1, split.length);
    command = split[0];
  }

  return {
    command: command,
    args: args
  };
}

