#!/usr/bin/env node
const program = require("commander");
const Docker = require("dockerode");
const utils = require("../lib/utils");
const fs = require("fs-extra");
const path = require("path");
const conf = require("../conf");
const serviceRegistryFactory = require("../lib/service-registry/service-registry-factory");
const docker = new Docker();

program
  .option("-e, --environment <environment>", "prod|int|stg etc")
  .option("--exclude <exclude>", "name of service that will not be started, separate with comma if multiple")
  .option("--verbose", "Verbose logging of build")
  .description(`
Start fruster locally using a docker image that contains all services (a.k.a. a "box"). 

Will start all services defined in service registry file. 

Example:

# Start fruster using docker image named frostdigital/foo-box with services defined in local file 
$ fruster start-box services.json frostdigital/foo-box
`)
  .parse(process.argv);


async function startBox(serviceRegPath, dockerImage) {

  // Create service registry either from file or fetch from git
  const serviceReg = await serviceRegistryFactory.create(serviceRegPath, { allowBuildFailures: false });
  
  // Create a single, flat JSON representation of service registry (not any inheritance) and save it temporarily
  // so it can be referenced as a volume while starting the container
  const servicesJsonFilePath = utils.writeTempJsonFile("services.json", serviceReg.toJSON());

  // Make sure that directory where mongo will persist data exists.
  // This is needed to data will not be lost when image is (re)started.
  const databaseDirPath = ensureDatabaseDir(serviceReg.name);

  // Tricky configuration stuff below, but it basically instructs docker to create a container with port
  // mappings setup and volumes mounted for service registry file and mongo data. The container will, apart 
  // from starting mongod and nats (using a start.sh script that already exists inside container), run all 
  // services using fruster-tools from within the container that references the provided service registry. 
  // 
  // Check docker API docs for more config details:
  // https://docs.docker.com/engine/api/v1.24/
  const createOpts = {
    Image: dockerImage,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Cmd: [
      "/bin/bash", 
      "-c", 
      `(/root/start.sh &) && fruster run /service-registry/services.json --dir /services --skip-build --skip-update --exclude ${program.exclude}`
    ],
    HostConfig: {
      PortBindings: {
        "3000/tcp": [{
          "HostPort": "3000"
        }],
        "3001/tcp": [{
          "HostPort": "3001"
        }],
        "27017/tcp": [{
          "HostPort": "27017"
        }],
        "4222/tcp": [{
          "HostPort": "4222"
        }]
      },
      Binds: [
        databaseDirPath + ":/data/db",
        utils.getDirPath(servicesJsonFilePath) + ":/service-registry"
      ]
    }
  };
  
  // Create and start the container
  let container = await docker.createContainer(createOpts);
  await container.start();

  // Attach to get output and send input
  container.attach({
    stream: true,
    stdout: true,
    stderr: true,
    stdin: true
  }, (err, stream) => {

    pipeStdOut(stream);
    pipeStdIn(stream);

    container.wait(() => exit(stream));
  });
}

const serviceRegPath = program.args[0];
const dockerImage = program.args[1];

if (!serviceRegPath) {
  console.error("ERROR: Missing name of fruster to start");
  process.exit(1);
}

if (!dockerImage) {
  console.error("ERROR: Missing docker image");
  process.exit(1);
}

startBox(serviceRegPath, dockerImage);

//
// Utils -------------------------------------------------
//
 
function pipeStdOut(stream) {
  stream.pipe(process.stdout);
}

function pipeStdIn(stream) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.pipe(stream);
}

function ensureDatabaseDir(serviceRegName) {
  const dbDirPath = path.join(conf.frusterHome, serviceRegName, "db"); 
  fs.ensureDirSync(dbDirPath);
  return dbDirPath;
}

function exit(stream) {
  process.stdin.removeAllListeners();
  process.stdin.resume();
  stream.end();
  process.exit();
}