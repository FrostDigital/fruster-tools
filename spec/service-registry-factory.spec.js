const path = require("path");

process.env.FRUSTER_HOME = path.join(__dirname, ".tmp-fruster-home");

const svcReg = require("../src/service-registry/service-registry-factory");

jasmine.DEFAULT_TIMEOUT_INTERVAL = 30 * 1000;

describe("Service registry", () => {
	// @ts-ignore
	let paceup;

	beforeEach((done) => {
		process.env.AN_ENV_VAR = "12";

		svcReg
			.create(path.join(__dirname, "support", "fruster-paceup.json"))
			.then((serviceRegistry) => {
				paceup = serviceRegistry;
				done();
			})
			.catch(done.fail);
	});

	afterEach(() => {
		delete process.env.AN_ENV_VAR;
	});

	it("should be created from file", async () => {
		const serviceRegistry = await svcReg.create(path.join(__dirname, "support", "fruster-paceup.json"));

		expect(serviceRegistry).toBeDefined();
		expect(serviceRegistry.services.length).toBe(2);
		expect(serviceRegistry.services[0].env.LOG_LEVEL).toBe("DEBUG");
		expect(serviceRegistry.services[0].env.FOO).toBe("12");
	});

	it("should get filtered list of services", () => {
		// @ts-ignore
		expect(paceup.getServices("*api*").length).toBe(1);
	});

	describe("with inheritance", () => {
		// @ts-ignore
		let serviceRegistry;

		beforeEach(async () => {
			serviceRegistry = await svcReg.create(
				path.join(__dirname, "support", "service-registry-inheritance", "extends.json")
			);
		});

		it("should inherit from extended service registry", () => {
			// @ts-ignore
			expect(serviceRegistry.services.length).toBe(2);
			// @ts-ignore
			expect(serviceRegistry.services[0].env.HELLO_FROM_SUPER).toBe("true");
			// @ts-ignore
			expect(serviceRegistry.services[0].env.FOO).toBe("BAR");
			// @ts-ignore
			expect(serviceRegistry.services[1].env.HELLO_FROM_SUPER).toBe("true");
			// @ts-ignore
			expect(serviceRegistry.name).toBe("test");
			// @ts-ignore
			expect(serviceRegistry.services[0].image).toBe("fruster/fruster-api-gateway");
			// @ts-ignore
			expect(serviceRegistry.services[1].image).toBe("fruster/fruster-auth-service");

			// @ts-ignore
			let apiGateway = serviceRegistry.services.find((s) => s.name === "fruster-api-gateway");
			expect(apiGateway.env.GLOBAL_ENV_VAR).toBe("overridden global env var");
			expect(apiGateway.env.NULL).toBeUndefined();
		});

		it("should get a flat representation when invoking toJSON()", () => {
			// @ts-ignore
			const json = serviceRegistry.toJSON();

			expect(json.services.length).toBe(2);
			expect(json.services[0].env.HELLO_FROM_SUPER).toBe("true");
			expect(json.services[0].env.FOO).toBe("BAR");
			expect(json.services[1].env.HELLO_FROM_SUPER).toBe("true");
			expect(json.name).toBe("test");
		});

		it("should interpolate env", () => {
			// @ts-ignore
			const json = serviceRegistry.toJSON();
			// @ts-ignore
			const frusterAuthService = json.services.find((service) => service.name === "fruster-auth-service");
			expect(frusterAuthService.env.INTERPOLATED_VALUE).toBe("INTERPOLATED!");
		});
	});
});
