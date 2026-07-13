import type { TopologyBuilder } from "../../core/contracts";
import { delaunayTopologyBuilder } from "../../core/topology/buildTopology";
import {
  createMembraneLegacyRuntime,
  createMembranePulseRuntime,
  membraneLegacyRuntimeKey,
  membranePulseRuntimeKey,
} from "./state";

export const membraneTopologyBuilder: TopologyBuilder = {
  build(viewport, config) {
    const result = delaunayTopologyBuilder.build(viewport, config);
    const initializeBaseResources = result.initializeResources;

    return {
      ...result,
      initializeResources(resources) {
        initializeBaseResources?.(resources);
        resources.set(
          membranePulseRuntimeKey,
          createMembranePulseRuntime(result.topology),
        );
        resources.set(
          membraneLegacyRuntimeKey,
          createMembraneLegacyRuntime(result.topology),
        );
      },
    };
  },
};
