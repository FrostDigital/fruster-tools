const spawn = require('child_process').spawn;

module.exports = function(name, command, cwd, env, onData) {
	return new Spawned({
		name: name,
		command: command,
		cwd: cwd,
		env: env,
		onData: onData
	});
};

class Spawned {

	constructor(opts) {
		this.name = opts.name;
		this.command = opts.command;
		this.cwd = opts.cwd;
		this.env = opts.env;
		this.state = 'starting';
		this.output = [];
		this.childProcess = this.createChildProcess();
		this.onData = opts.onData;
	}

	createChildProcess() {
		const parsedCommand = parseCommand(this.command);

		let childProcess = spawn(parsedCommand.command, parsedCommand.args, {
			env: createEnv(this.env),
			cwd: this.cwd			
		});

		if(childProcess) {
			this.state = "running";
			
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
			data: data.toString().replace(/\n/g,""),
			processName: this.name
		};

		this.output.push(msg);

		if(this.onData) {
			this.onData(msg);
		}
	}

	onChildProcessExit(exitCode) {		
		this.state = 'terminated';
		this.exitCode = exitCode;
	}

	kill() {
		this.childProcess.kill();
	}

	exitPromise() {
		return new Promise((resolve, reject) => {

			function resolveOrReject(exitCode) {
				return exitCode == 0 ? resolve() : reject(exitCode);
			}

			if(this.state == 'terminated') {
				return resolveOrReject(this.exitCode);
			} else {
				this.childProcess.on('exit', (exitCode) => resolveOrReject(exitCode));
			}
		}); 
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

function createEnv(serviceEnv = {}) {
	return Object.assign({}, process.env, serviceEnv);
}
