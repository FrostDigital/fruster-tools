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
		expect(paceup.getServices().length).toBe(2);
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
			});

			// Note: Either stop test after 1 sec or end when exit promise is resolved
			setTimeout(() => paceup.startedProcesses.forEach(expectRunningOrTerminatedProcess), 1000);

			// batchStart.whenAllDone()
			// 	.then(expectRunningOrTerminatedProcess)
			// 	.catch(done.fail);
			
			function expectRunningOrTerminatedProcess(p) {
				//expect(["running", "terminated"]).toMatch(p.state);
				expect(p.output.length).toBeGreaterThan(0);
				expect(onDataCounter).toBeGreaterThan(p.output.length);
				done();
			}
		});

	});

});