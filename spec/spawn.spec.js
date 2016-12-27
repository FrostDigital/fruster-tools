const spawn = require("../lib/spawn");

describe("Spawn", () => {
	
	it("should spawn 'ls -al'", done => {
		let spawned = spawn("id", "ls -al", __dirname, { foo: "bar" });

		expect(spawned).toBeDefined();

		spawned.exitPromise().then(() => {
			expect(spawned.output.length).toBeGreaterThan(0);
			expect(spawned.state).toBe("terminated");
			expect(spawned.exitCode).toBe(0);
			expect(spawned.env.foo).toBe("bar");
			done();			
		})
	});
	
	it("should spawn invalid command", done => {
		let spawned = spawn("id", "ls -invalid-option", __dirname);

		expect(spawned).toBeDefined();

		spawned.exitPromise().catch(() => {
			expect(spawned.output.length).toBeGreaterThan(0);
			expect(spawned.state).toBe('terminated');
			expect(spawned.exitCode).toBe(1);		
			done();			
		})
	});

	it("should spawn and get output from npm", done => {
		let spawned = spawn("npm", "npm install", __dirname);

		expect(spawned).toBeDefined();

		spawned.exitPromise().then(() => {
			expect(spawned.output.length).toBeGreaterThan(0);
			expect(spawned.state).toBe('terminated');
			expect(spawned.exitCode).toBe(0);
			done();			
		})
	});

});