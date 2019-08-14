const spawn = require("../lib/spawn");

describe("Spawn", () => {
	it("should spawn 'ls -al'", done => {
		let spawned = spawn({
			name: "id",
			command: "ls -al",
			cwd: __dirname,
			env: { foo: "bar" }
		});

		expect(spawned).toBeDefined();

		spawned.exitPromise().then(() => {
			expect(spawned.output.length).toBeGreaterThan(0);
			expect(spawned.exitCode).toBe(0);
			expect(spawned.env.foo).toBe("bar");
			done();
		});
	});

	it("should spawn invalid command", done => {
		let spawned = spawn({
			name: "id",
			command: "ls -invalid-option"
		});

		expect(spawned).toBeDefined();

		spawned.exitPromise().catch(() => {
			expect(spawned.output.length).toBeGreaterThan(0);
			expect(spawned.exitCode).toBeGreaterThan(0);
			done();
		});
	});

	xit("should spawn and get output from npm", done => {
		let spawned = spawn({
			name: "npm",
			command: "npm install"
		});

		expect(spawned).toBeDefined();

		spawned.exitPromise().then(() => {
			expect(spawned.exitCode).toBe(0);
			done();
		});
	});
});
