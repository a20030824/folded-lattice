import type { SimulationSystem } from "../contracts";

export const springSystem: SimulationSystem = {
  name: "springs",
  update(state, config) {
    const { nodes, edges } = state.topology;
    const physics = config.physics;

    for (const edge of edges) {
      const a = nodes[edge.nodeA]!;
      const b = nodes[edge.nodeB]!;
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-6) continue;

      const extension = length - edge.restLength;
      const planarForce = extension * physics.springStrength * physics.planarSpringStrength;
      const verticalForce = extension * physics.springStrength * physics.verticalSpringStrength;
      const nx = dx / length;
      const ny = dy / length;
      const nz = dz / length;

      if (!a.pinned) {
        a.force.x += nx * planarForce;
        a.force.y += ny * planarForce;
        a.force.z += nz * verticalForce;
      }
      if (!b.pinned) {
        b.force.x -= nx * planarForce;
        b.force.y -= ny * planarForce;
        b.force.z -= nz * verticalForce;
      }
    }

    for (const node of nodes) {
      if (node.pinned) continue;
      node.force.x +=
        (node.restPosition.x + node.memoryOffset.x - node.position.x) *
        physics.restPoseStrength;
      node.force.y +=
        (node.restPosition.y + node.memoryOffset.y - node.position.y) *
        physics.restPoseStrength;
      node.force.z +=
        (node.restPosition.z + node.memoryOffset.z - node.position.z) *
        physics.restPoseStrength;
    }
  },
};
