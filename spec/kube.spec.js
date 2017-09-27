const kube = require("../lib/kube");
const path = require("path");
const fs = require("fs-extra"); 
const uuid = require("uuid");

process.env.DEBUG = true;

if(!process.env.KUBE_INTEGRATION_TEST) {
  return;
}

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

  it("should get pods by pod name only", done => {              

    kube.getPods("nats*")
      .then((pods) => {
        expect(pods.length).toBeGreaterThan(0);        
        done();
      })
      .catch(done.fail);
  });

});