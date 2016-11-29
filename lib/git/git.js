const cmd = require("../cmd");
const GitRepo = require("./git-repo");

let git = {};

module.exports = git;

git.clone = (repoUrl, to) => { 
  repoUrl = alignRepoName(repoUrl);

  return cmd(`git clone ${repoUrl} ${to || ""}`)
    .then(() => new GitRepo(repoUrl, to))
    .then(repo => setCurrentBranch(repo))    
    .catch(err => {
      console.error(err);
      throw err;
    });
};

git.init = (dir) => {
  return cmd(`git -C ${dir} config --get remote.origin.url`)
    .then(repoUrl => new GitRepo(repoUrl, dir))
    .then(repo => setCurrentBranch(repo))
    .catch(err => {
      throw new Error("Missing or invalid git repo in dir:", dir)
    });    
};

git.checkout = (repo, branch, createBranch) => {   
  if(!repo || !repo instanceof GitRepo) {
    return Promise.reject("Missing or invalid repo");
  }

  if(!branch) {
    return Promise.reject("Missing branch name");
  }

  return cmd(`git -C ${repo.dir} checkout ${createBranch ? "-b" : ""} ${branch}`)
    .then(console.log)
    .then(() => setCurrentBranch(repo))
    .catch(console.error);
};

function setCurrentBranch(repo) {
  return cmd(`git -C ${repo.dir} branch | grep  ^*|cut -d" " -f2`).then(branch => {
    repo.branch = branch.trim();
    return repo;
  });
}

function alignRepoName(repoUrl) {
  // Add full github url if just `org/repo` is passed in
  if(!repoUrl.includes("git@github.com") && !repoUrl.includes("http://")) {
    return "git@github.com:" + repoUrl + ".git";
  } else {
    return repoUrl;    
  }
}



