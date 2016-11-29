const git = require("../git");
const conf = require("../../conf");
const path = require("path");

const serviceRegistryDirName = "service-registry";

module.exports = {
  update: update
};

function update(fruster) {
  const dir = path.join(conf.frusterHome, fruster, serviceRegistryDirName);

  return git.init(dir)
    .catch(() => git.clone("frostdigital/paceup", dir))
    .then(repo => git.pull());
}


