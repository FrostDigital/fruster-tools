const path = require("path");

process.env.FRUSTER_DIR = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../lib/service-registry");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

describe("Service registry", () => {

	let paceup;

	beforeEach(() => {
		paceup = svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"));
	})

	it("should be created from file", () => {
		const services = paceup.getServices();
		expect(services.length).toBe(2);
		expect(services[0].env).toEqual({
			"LOG_LEVEL": "DEBUG"
		});
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