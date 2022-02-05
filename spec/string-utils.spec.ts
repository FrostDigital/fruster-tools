import { parseImage } from "../src/utils/string-utils";

fdescribe("string-utils", () => {
	it("should parse image (ecr registry)", () => {
		const image = "126311103123.dkr.ecr.eu-north-1.amazonaws.com/wb-contact-service:develop-1237fbf3";

		const { imageTag, imageName, registry, org } = parseImage(image);

		expect(registry).toBe("126311103123.dkr.ecr.eu-north-1.amazonaws.com");
		expect(imageName).toBe("wb-contact-service");
		expect(imageTag).toBe("develop-1237fbf3");
		expect(org).toBe("");
	});

	it("should parse image (docker hub)", () => {
		const image = "nginx:latest";

		const { imageTag, imageName, registry, org } = parseImage(image);

		expect(registry).toBe("");
		expect(imageName).toBe("nginx");
		expect(imageTag).toBe("latest");
		expect(org).toBe("");
	});

	it("should parse image (docker hub with org)", () => {
		const image = "fruster/fruster-api-gateway:latest";

		const { imageTag, imageName, registry, org } = parseImage(image);

		expect(registry).toBe("");
		expect(org).toBe("fruster");
		expect(imageName).toBe("fruster-api-gateway");
		expect(imageTag).toBe("latest");
	});
});
