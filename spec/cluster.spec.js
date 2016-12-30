setEnv();

const path = require("path");
const utils = require("../lib/utils");
const conf = require("../conf");

fdescribe("Cluster", () => {
  
  const cluster = require("../lib/cluster");
  
  afterAll(unsetEnv);

  it("should switch kube and deis config", () => {              
    cluster.use("test-cluster-1");

    const symlinkedKubeConfigPath = path.join(conf.kubeHome, "config");
    const symlinkedKubeCredentialsPath = path.join(conf.kubeHome, "credentials");
    const symlinkedFakeKeyPath = path.join(symlinkedKubeCredentialsPath, "fake.pem");

    expect(utils.hasSymlink(symlinkedKubeConfigPath)).toBe(true);    
    expect(utils.hasSymlink(symlinkedKubeCredentialsPath)).toBe(true);    
    expect(utils.readFile(symlinkedKubeConfigPath)).toMatch("test-cluster-1");
    expect(utils.hasFile(symlinkedFakeKeyPath)).toBe(true);

    const symlinkedDeisConfigPath = path.join(conf.deisHome, "client.json");
    const activeDeisConfigPath = path.join(conf.frusterHome, "deis", "active.json");
    const masterDeisConfigPath = path.join(conf.frusterHome, "deis", "test-cluster-1.json");

    expect(utils.hasSymlink(symlinkedDeisConfigPath)).toBe(true);      
    expect(utils.readFile(symlinkedDeisConfigPath)).toMatch("test-cluster-1");
    expect(utils.readFile(symlinkedDeisConfigPath)).toBe(utils.readFile(masterDeisConfigPath));
    expect(utils.readFile(masterDeisConfigPath)).toBe(utils.readFile(activeDeisConfigPath));
  });

  it("should not be able to use cluster that is missing cluster config", () => {              
    expect(() => cluster.use("does-not-exist")).toThrow();
  });

  it("should fail to validate cluster that is missing kube config", () => {              
    expect(() => cluster.checkKubeConfig("does-not-exist")).toThrow();
  });

  it("should fail to validate cluster that is missing deis config", () => {              
    expect(() => cluster.checkDeisConfig("does-not-exist")).toThrow();
  });

});

function setEnv() {
  const path = require("path");
  
  Object.assign(process.env, {
    DEIS_HOME: path.join(__dirname, "support", "deis"),
    KUBE_HOME: path.join(__dirname, "support", "kube"),
    CLUSTERS_HOME: path.join(__dirname, "support", "clusters"),
    FRUSTER_HOME: path.join(__dirname, "support", "fruster"),
  });

  console.log();
}

function unsetEnv() {
  ["DEIS_HOME", "KUBE_HOME", "CLUSTERS_HOME", "FRUSTER_HOME"].forEach(k => {
    delete process.env[k];
  });
}