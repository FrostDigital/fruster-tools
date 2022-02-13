import crypto from "crypto";
import { patchDeployment } from "../kube/kube-client";
const { CHANGE_CAUSE_ANNOTATION } = require("../kube/kube-constants");

/**
 * Set hash of config for deployment to trigger rollout.
 * Idea taken from here:
 * https://blog.questionable.services/article/kubernetes-deployments-configmap-change/
 *
 * @param {string} namespace
 * @param {string} serviceName
 * @param {any} config
 * @param {string} changeCause
 */
export async function patchDeploymentWithConfigHash(
	namespace: string,
	serviceName: string,
	config: { [x: string]: string },
	changeCause: string
) {
	const configHash = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");

	await patchDeployment(namespace, serviceName, {
		body: {
			metadata: {
				annotations: {
					[CHANGE_CAUSE_ANNOTATION]: changeCause,
				},
			},
			spec: {
				template: {
					metadata: { annotations: { configHash } },
				},
				containers: [
					{
						env: Object.keys(config).map((key) => ({
							name: key,
							valueFrom: {
								secretKeyRef: {
									key,
									name: serviceName + "-config",
								},
							},
						})),
					},
				],
			},
		},
	});
}
