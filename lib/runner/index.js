const kube = require("../kube");
const deis = require("../deis");
const conf = require("../../conf");
const term = require("terminal-kit").terminal;
const serviceReg = require("../service-registry");
const spinner = require("../utils/spinner");

module.exports = {
	start: start
};

function start(serviceRegPath) {

	let serviceRegInstance = serviceReg.create(serviceRegPath);

	return serviceRegInstance.cloneOrUpdateServices()
		.then(() => {
			term.clear();

			term.cyan(`Building ${serviceRegInstance.services.length} instance(s)`);

			// Start build
			let batchBuild = serviceRegInstance.build();

			// Create spinners
			batchBuild.processes.forEach(createBuildSpinner);

			// Continue when all builds completed
			return batchBuild.whenAllDone()
				.then(delayPromise)
				.then(term.clear);
		})
		.then(() => showSummaryView(serviceRegInstance));

	process.on("exit", serviceRegInstance.killAll);
}

function showSummaryView(serviceRegInstance) {
	//showMenu(serviceRegInstance.services.map(s => s.name));
	const numServices = serviceRegInstance.services.length;

	term.cyan(`Running ${numServices} instance(s)`);

	// Start services
	let batchStart = serviceRegInstance.start(msg => {
		//term(`[${msg.processName}] ${msg.data}\n`);
	});

	term.moveTo(0, term.height, `Choose service 1-${numServices} view logs`);

	// Show spinners
	batchStart.processes.forEach(createRunSpinner);

	return batchStart.whenAllDone();
}

function createBuildSpinner(childProcess, index) {
	spinner.create(`Building ${childProcess.name}...`, index+2, () => {
		if (childProcess.state == "terminated") {
			return childProcess.exitCode == 0 ? "done" : "failed";
		}
		return "loading";
	}).start();
}

function createRunSpinner(childProcess, index) {
	spinner.create(`${index+1}) ${childProcess.name}`, index+2, () => {
		if (childProcess.state == "terminated") {
			return childProcess.exitCode == 0 ? "done" : "failed";
		}
		return "loading";
	}).start();
}

function delayPromise() {
	return new Promise((resolve, reject) => setTimeout(resolve, 300));
}

function showMenu(services) {
	var items = ['Summary'].concat(services);

	var options = {
		y: term.height, // the menu will be on the top of the terminal
		style: term.inverse,
		selectedStyle: term.dim.blue.bgGreen
	};

	term.clear();

	term.singleLineMenu(items, options, function(error, response) {
		// term('\n').eraseLineAfter.green(
		// 	"#%s selected: %s (%s,%s)\n",
		// 	response.selectedIndex,
		// 	response.selectedText,
		// 	response.x,
		// 	response.y
		// );

		console.log(response);
		process.exit();
	});

}