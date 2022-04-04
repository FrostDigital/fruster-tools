import k8s from "@kubernetes/client-node";

export interface Secret extends k8s.V1Secret {}
