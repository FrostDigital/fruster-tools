const cmd = require("../cmd");
const GitRepo = require("./git-repo");
const path = require("path");
const fs = require("fs-extra");
const log = require("../log");
const utils = require("../utils");

let git = {};

module.exports = git;

git.clone = (repoUrl, to, depth) => {
  repoUrl = utils.getGithubRepoUrl(repoUrl);

  fs.ensureDirSync(to);

  return cmd(`git clone ${depth ? "--depth " + depth : ""} ${repoUrl} ${to || ""}`)
    .then(() => new GitRepo(repoUrl, to))
    .then(repo => setCurrentBranch(repo))
    .catch(err => {
      log.error(err);
      throw err;
    });
};

git.isRepo = (dir) => {
  try {
    return fs.lstatSync(path.join(dir, ".git")).isDirectory();
  } catch (ex) {
    return false;
  }
};

git.init = (dir) => {
  return cmd(`git -C ${dir} config --get remote.origin.url`)
    .then(repoUrl => new GitRepo(repoUrl, dir))
    .then(repo => setCurrentBranch(repo))
    .catch(err => {
      console.log(err);
      throw new Error("Missing or invalid git repo in dir:" + dir)
    });
};

git.checkout = (repo, branch, createBranch) => {

  if (!repo || !repo instanceof GitRepo) {
    return Promise.reject("Missing or invalid repo");
  }

  if (!branch) {
    return Promise.reject("Missing branch name");
  }

  return cmd(`git -C ${repo.dir} checkout ${createBranch ? "-b" : ""} ${branch}`)
    .then(log.debug)
    .then(() => setCurrentBranch(repo))
    .catch(log.error);
};

git.pull = (repo) => {
  if (!repo || !repo instanceof GitRepo) {
    return Promise.reject("Missing or invalid repo");
  }

  return cmd(`git -C ${repo.dir} pull`)
    .then(() => repo)
    .catch(log.error);
};

function setCurrentBranch(repo) {

  return cmd(`git -C ${repo.dir + "\\"} branch`)
    .then(branch => {
      repo.branch = branch.replace("*", "");
      repo.branch = branch.trim();
      return repo;
    });
}