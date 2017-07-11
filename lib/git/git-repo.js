const path = require("path");

class GitRepo {

  constructor(repoUrl, dir) {
    this.url = repoUrl;
    this.name = this.getRepoName();
    this.dir = this.getRepoDir(dir);
    this.branch = null;
  }

  getRepoName() {
    let split = this.url.split("/");
    return split[split.length - 1].replace(".git", "");
  }

  getRepoDir(dir) {
    console.log("\n");
    console.log("DIIIIIIIIIIRn");
    console.log(path.join(process.cwd(), this.name));
    console.log(dir.startsWith("/") ? dir : path.join(process.cwd(), this.name));
    console.log(require("util").inspect(dir, null, null, true));
    console.log("\n");
    if (!dir) {
      return path.join(process.cwd(), this.name);
    } else {
      return dir;
    }
  }

}

module.exports = GitRepo;

