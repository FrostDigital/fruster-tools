const utils = require("../lib/utils");

describe("Utils", () => {
  
  it("should parse git org and repo from relative github path", () => {              

    let parsedGitRepo = utils.parseGitUrl("organisation/repo");

    expect(parsedGitRepo.org).toBe("organisation");
    expect(parsedGitRepo.repo).toBe("repo"); 
    expect(parsedGitRepo.branch).toBe(null); 
  });

  it("should parse git org, repo and branch from relative github path", () => {              

    let parsedGitRepo = utils.parseGitUrl("organisation/repo#develop");

    expect(parsedGitRepo.org).toBe("organisation");
    expect(parsedGitRepo.repo).toBe("repo"); 
    expect(parsedGitRepo.branch).toBe("develop"); 
  });

  it("should parse git org and repo from full ssh url", () => {              

    let parsedGitRepo = utils.parseGitUrl("git@github.com:FrostDigital/fruster-tools.git");

    expect(parsedGitRepo.org).toBe("FrostDigital");
    expect(parsedGitRepo.repo).toBe("fruster-tools"); 
  });

  it("should parse git org and repo from full HTTP url", () => {              

    let parsedGitRepo = utils.parseGitUrl("https://github.com/FrostDigital/fruster-tools.git");

    expect(parsedGitRepo.org).toBe("FrostDigital");
    expect(parsedGitRepo.repo).toBe("fruster-tools"); 
  });

});