const git = require("../lib/git");
const path = require("path");
const fs = require("fs-extra"); 
const uuid = require("uuid");

process.env.DEBUG = true;

if(!process.env.GIT_INTEGRATION_TEST) {
  return;
}

describe("Git", () => {

  const testRepoTargetDir = path.join(__dirname, ".tmp", "test-repo");
  const testRepoName = "paceup";
  const testRepoOrgAndRepo = "frostdigital/" + testRepoName;
  const testRepoFullUrl = "git@github.com:" + testRepoOrgAndRepo + ".git";
  const developBranch = "develop";
  const masterBranch = "master";

  
  describe("clone and init", function() {
    beforeEach(() => {    
      fs.removeSync(testRepoTargetDir);
    });

    it("should clone repo when passing in organisation and repo", done => {              
      git.clone(testRepoOrgAndRepo, testRepoTargetDir)
        .then(repo => {
          expect(repo.dir).toBe(testRepoTargetDir);
          expect(repo.url).toBe(testRepoFullUrl);
          expect(repo.name).toBe(testRepoName);
          expect(repo.branch).toBe(developBranch);
          done();
        })
        .catch(done.fail);
    });

    it("should clone repo when passing in full git SSH url", done => {              
      git.clone(testRepoFullUrl, testRepoTargetDir)
        .then(repo => {
          expect(repo.dir).toBe(testRepoTargetDir);
          expect(repo.url).toBe(testRepoFullUrl);
          expect(repo.name).toBe(testRepoName);
          expect(repo.branch).toBe(developBranch);
          done();
        })
        .catch(done.fail);
    });

    it("should init existing repo", done => {              
      git.clone(testRepoFullUrl, testRepoTargetDir)
        .then(git.init(testRepoTargetDir))
        .then(repo => {
          expect(repo.dir).toBe(testRepoTargetDir);
          expect(repo.url).toBe(testRepoFullUrl);
          expect(repo.name).toBe(testRepoName);
          expect(repo.branch).toBe(developBranch);
          done();
        })
        .catch(done.fail);
    });

    it("should fail to init non existing repo", done => {              
      git.init("/foo/bar/foo")
        .then(done.fail)
        .catch(done);
    });
  });

  describe("branches", () => {

    let repo;

    beforeAll(done => {
      git.clone(testRepoFullUrl, testRepoTargetDir)
        .then(_repo => {
          repo = _repo;
          done();
        })
        .catch(done.fail);
    });
    
    afterAll(() => {    
      fs.removeSync(testRepoTargetDir);
    });

    it("should switch between branches", done => {
      expect(repo.branch).toBe(developBranch);

      git.checkout(repo, masterBranch)
        .then(repo => {
          expect(repo.branch).toBe(masterBranch);          
        })
        .then(() => git.checkout(repo, developBranch))
        .then(repo => {
          expect(repo.branch).toBe(developBranch);          
          done();
        })
        .catch(done.fail);
    });

    it("should checkout to new branch", done => {      
      const randomBranchName = uuid.v4();

      git.checkout(repo, randomBranchName, true)
        .then(repo => {
          expect(repo.branch).toBe(randomBranchName);   
          done();       
        })        
        .catch(done.fail);
    });
  });

  describe("push and pull", () => {
    // let repo;
    // let sandboxBranch = uuid.v4();

    // beforeAll(done => {
    //   git.clone(testRepoFullUrl, testRepoTargetDir)
    //     .then(repo => git.checkout(repo, sandboxBranch, true))
    //     .then(_repo => {
    //       repo = _repo;
    //       done();
    //     })
    //     .catch(done.fail);
    // });
    
    // afterAll(() => {    
    //   fs.removeSync(testRepoTargetDir);
    // });

    // it("should push new branch", done => {
    //   git.push(repo)
    //     .then(repo => {
    //       expect(repo.branch).toBe(masterBranch);          
    //     })
    //     .then(() => git.checkout(repo, developBranch))
    //     .then(repo => {
    //       expect(repo.branch).toBe(developBranch);          
    //       done();
    //     })
    //     .catch(done.fail);
    // });
  });
});