#!/usr/bin/env node

const program = require("commander");
const cluster = require("../lib/cluster");
const log = require("../lib/log");
const Enquirer = new require('enquirer');
let enquirer = new Enquirer();

program
	.option("--username [username]", "deis username (will be promted if not entered)")
	.option("--password [password]", "deis password (will be promted if not entered)")
	.option("--url [deis controller url]", "URL to deis controller, example http://deis.c1.fruster.se (will be promted if not entered)")
	.description(`
Will login to deis cluster and save credentials and config in \${FRUSTER_HOME}/deis/{cluster name}.json to be able to use it with "fruster use".

Example:

$ fruster add-deis-cluster c1 --username=joel --password=secret123 --url=https://deis.c1.fruster.se
`)
	.parse(process.argv);

const clusterName = program.args[0];
let url = program.url;
let username = program.username;
let password = program.password;

if (!clusterName) {
	log.error("Missing cluster name");
	process.exit(1);
}

let questions = [];

if(!username) {
	questions.push({
  		type: 'input',
  		message: 'Enter username',
  		name: 'username'
	});
}

if(!password) {
	enquirer.register('password', require('prompt-password'));

	questions.push({
  		type: 'password',
  		message: 'Enter password',
  		name: 'password'
	});
}

if(!url) {
	questions.push({
  		type: 'input',
  		message: 'Enter url to deis controller (include http scheme)',
  		name: 'url'
	});
}

function getUsernameAndPassword() {
	if(questions.length) {
		console.log('asking');
		return enquirer.ask(questions).then(answers => {			
			username = answers.username || username;
			password = answers.password || password;

			console.log(password);
			
			url = answers.url || url;
			if(!username || !password || !url) {
				throw new Error("Username, password and deis controller URL must be set");
			}
		});
	} else {
		return Promise.resolve();
	}
}

function addDeisCluster() {
	cluster
		.addDeisCluster(clusterName, username, password, url)
		.then(() => {
			log.info(`Cluster added, switch to it with:\n$ fruster use ${clusterName}`);
		})
		.catch(err => {
			log.error(err);
		});
}

getUsernameAndPassword()
	.then(addDeisCluster);