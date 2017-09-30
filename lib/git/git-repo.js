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
    return split[split.length-1].replace(".git", "");
  }

  getRepoDir(dir) {
    if(!dir) {
      return path.join(process.cwd(), this.name);
    } else { 
      return dir;
      //return dir.startsWith("/") ? dir : path.join(process.cwd(), this.name);  
    }
  }

}

module.exports = GitRepo;

