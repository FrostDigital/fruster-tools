import moment from "moment";
import { printTable } from "./cli-utils";
import * as log from "../log";

export const matchPattern = (str: string, pattern = "") => {
	if (pattern.indexOf("*") > -1) {
		return new RegExp("^" + pattern.split("*").join(".*") + "$").test(str);
	} else {
		return str == pattern.trim();
	}
};

export const capitalize = ([first, ...rest]: string[]) => {
	return first.toUpperCase() + rest.join("").toLowerCase();
};

/**
 * @param {string} image
 */
export const parseImage = (image: string) => {
	const [imageName, imageTag] = image.split(":");

	return {
		imageName,
		imageTag,
	};
};

/**
 * @param {string} string
 */
export const isSemver = (str: string) => {
	return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/.test(
		str
	);
};

const re = /(\S*?)=(\S*)|\"(.*)\"/g;

export const parseStringConfigToObj = (str: string) => {
	str = str.trim();

	if (!str) {
		return {};
	}

	const matches = Array.from(str.matchAll(re));

	let out: any = {};

	for (let [_, key, val] of matches) {
		// Strip ""

		if (val.indexOf('"') === 0 && val.lastIndexOf('"') === val.length - 1) {
			val = val.substring(1, val.length - 1);
		}

		out[key] = val;
	}

	return out;
};

export function prettyPrintPods(pods: any[]) {
	const podInfo = pods.map((pod: any, i: number) => {
		const [lastContainerStatus] = pod.status.containerStatuses;
		const { imageName, imageTag } = parseImage(pod.spec.containers[0].image);
		const { state } = lastContainerStatus;

		let containerStatusDescription = " ";
		let since = " ";

		if (state.waiting && ["ImagePullBackOff", "ErrImagePull"].includes(state.waiting.reason)) {
			containerStatusDescription = `Failed to pull image ${imageName}:${imageTag}`;
		} else if (state.running) {
			containerStatusDescription = `✅`;

			since = moment(state.running.startedAt).fromNow().replace("minutes", "min");
		} else if (state.terminated) {
			containerStatusDescription = `💥`;

			since = moment(state.terminated.startedAt).fromNow().replace("minutes", "min");
		} else {
			containerStatusDescription = JSON.stringify(state);
		}

		return [`Pod ${++i}:`, pod.metadata.name, imageTag, `${pod.status.phase}`, since, containerStatusDescription];
	});

	if (podInfo.length) {
		printTable(podInfo);
	} else {
		log.warn("App has no pods");
	}
}
