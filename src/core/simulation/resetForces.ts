import type { SimulationSystem } from "../contracts";

export const resetForcesSystem: SimulationSystem = {
  name: "reset-forces",
  update(state) {
    for (const node of state.topology.nodes) {
      node.force.x = 0;
      node.force.y = 0;
      node.force.z = 0;
    }
  },
};
