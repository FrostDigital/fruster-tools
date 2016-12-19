const kube = require("../lib/kube");
const path = require("path");
const fs = require("fs-extra"); 
const uuid = require("uuid");

process.env.DEBUG = false;

describe("Kube", () => {
  
  it("should get logs", done => {              

    kube.logs("pu-api-gateway")
      .then(() => {        
        done();
      })
      .catch(done.fail);
  });


  it("should nog get logs for invalid app", done => {              

    kube.logs("does-not-exist")      
      .catch(done);
  });

});