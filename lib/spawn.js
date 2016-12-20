const spawn = require('child_process').spawn;

module.exports = function(command, env, cwd, onData, onError) {

	return new Promise((resolve, reject) => {

		if (!command) {
			reject('Missing command');
		}

		var parsedCommand = parseCommand(command);

		var child = spawn(parsedCommand.command, parsedCommand.args, {
			env: createEnv(env),
			cwd: cwd
		});

		child.stdout.on('data', data => {
			onData(data.toString().replace('\n', ''));
		});

		child.stderr.on('data', (data) => {
			if (onError) {
				onError(data.toString().replace('\n', ''));
			}
		});

		child.on('exit', exitCode => {
			return exitCode == 0 ? resolve() : reject(exitCode);
		});

		return child;
	});

};

function createEnv(serviceEnv) {
	return Object.assign({}, process.env, serviceEnv);
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