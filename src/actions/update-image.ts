import { getDeployment, getPods, patchDeployment } from "../kube/kube-client";
import * as log from "../log";
import { getUsername, sleep } from "../utils/cli-utils";
import { getDeploymentImage } from "../utils/kube-utils";
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");

export async function updateImage(serviceName: string, namespace: string, newTag: string, verify?: boolean) {
	const deployment = await getDeployment(namespace, serviceName);

	if (!deployment) {
		throw new Error(`Çannot update image - deployment ${serviceName} was not found`);
	}

	const [existingImage, existingImageTag] = getDeploymentImage(deployment).split(":");
	const newImage = `${existingImage}:${newTag}`;
	const username = await getUsername();

	await patchDeployment(namespace, serviceName, {
		// body: {
		metadata: {
			annotations: {
				[CHANGE_CAUSE_ANNOTATION]: `${username} changed image version ${existingImageTag} -> ${newTag}`,
			},
		},
		spec: {
			template: {
				spec: {
					containers: [{ name: serviceName, image: newImage }],
				},
			},
		},
		// },
	});

	log.info(`Image tag/version changed ${existingImageTag} -> ${newTag}`);

	if (verify) {
		log.info(`\nVerifying deploy...`);

		const numAttempts = 20;
		let verified = false;

		for (let i = 1; i <= numAttempts; i++) {
			const pods = await getPods(namespace, serviceName);

			const pod = pods.find((pod) => {
				return pod.spec?.containers[0].image === newImage;
			});

			const attemptPrefix = `\nAttempt ${i}/${numAttempts}:`;

			if (!pod) {
				log.info(`${attemptPrefix} Did not find any pod with image ${newImage}...`);
			} else if (pod.status?.phase === "Running") {
				log.success(`${attemptPrefix} ✅ Pod with image ${newImage} is running`);
				verified = true;
				break;
			} else {
				log.info(`${attemptPrefix} Found pod with image ${newImage} but has status '${pod.status?.phase}'...`);
				if (pod.status?.containerStatuses) {
					const { state } = pod.status.containerStatuses[0];

					if (state?.waiting) {
						log.info(`${state.waiting.reason} ${state.waiting.message || ""}`);
					}
				} else {
					log.info(pod.status?.phase || "Unknown phase");
				}
			}

			await sleep(3000);
		}

		if (!verified) {
			log.error(`\nFailed to verify that app with image ${newImage} was deployed`);
		}
	}
}
