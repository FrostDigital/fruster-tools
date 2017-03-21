const path = require("path");

process.env.FRUSTER_HOME = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

describe("Service registry", () => {

	let paceup;

	beforeEach(done => {
		process.env.AN_ENV_VAR = "12";

		svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"))
		.then(serviceRegistry => {
			paceup = serviceRegistry;
			done();
		})
		.catch(done.fail);
	});

	afterEach(() => {
		delete process.env.AN_ENV_VAR;
	});

	it("should be created from file", done => {

		svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"))
		.then(serviceRegistry => {			
			expect(serviceRegistry).toBeDefined();
			expect(serviceRegistry.services.length).toBe(2);
			expect(serviceRegistry.services[0].env.LOG_LEVEL).toBe("DEBUG");
			expect(serviceRegistry.services[0].env.FOO).toBe("123");
			done();
		})
		.catch(done.fail);		
	});

	it("should be created from git repo", done => {
		svcReg.create("frostdigital/paceup")
		.then(serviceRegistry => {			
			expect(serviceRegistry).toBeDefined();
			expect(serviceRegistry.services.length).toBeGreaterThan(5);
			done();
		})
		.catch(done.fail);		
	});


	it("should get filtered list of services", () => {
		expect(paceup.getServices("*api*").length).toBe(1);
	});


	describe("that is cloned or updated", () => {

		beforeEach(done => {			
			paceup.cloneOrUpdateServices().then(done).catch(done.fail);
		});

		afterEach(() => {
			paceup.killAll();
		});

		it("should build services", done => {
			paceup.build();

			expect(paceup.buildProcesses.length).toBe(2);

			paceup.buildProcesses.forEach(p => {
				expect(p.exitCode).toBe(null);
				expect(["fruster-api-gateway", "fruster-auth-service"]).toContain(p.name);
			});

			paceup.whenAllBuilt().then(() => {
					paceup.buildProcesses.forEach(p => {
						expect(p.exitCode).toBe(0);
					});
					done();
				})
				.catch(done.fail);
		});

		it("should start services (and probably fail to do so)", done => {
			let onDataCounter = 0;
			paceup.start((data) => {
				onDataCounter++;
			});

			expect(paceup.startedProcesses.length).toBe(2);

			paceup.startedProcesses.forEach(p => {
				expect(p.exitCode).toBe(null);
				expect(["fruster-api-gateway", "fruster-auth-service"]).toContain(p.name);
				expect(p.env.LOG_LEVEL).toBe("DEBUG");				
			});
			
			setTimeout(() => paceup.startedProcesses.forEach(expectRunningOrTerminatedProcess), 1000);

			function expectRunningOrTerminatedProcess(p) {
				expect(p.output.length).toBeGreaterThan(0);
				expect(onDataCounter).toBeGreaterThan(p.output.length);
				done();
			}
		});

	});

});