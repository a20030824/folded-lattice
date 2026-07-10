import type { SimulationSystem } from "../contracts";

function clampVelocity(
  x: number,
  y: number,
  z: number,
  maximum: number,
): [number, number, number] {
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= maximum || magnitude < 1e-6) return [x, y, z];
  const scale = maximum / magnitude;
  return [x * scale, y * scale, z * scale];
}

export const integrationSystem: SimulationSystem = {
  name: "integration",
  update(state, config, deltaSeconds) {
    const maximumDepth =
      Math.min(state.viewport.width, state.viewport.height) *
      config.physics.maximumDepthRatio;
    const dampingFactor = Math.exp(-config.physics.damping * deltaSeconds);

    for (const node of state.topology.nodes) {
      node.previousPosition.x = node.position.x;
      node.previousPosition.y = node.position.y;
      node.previousPosition.z = node.position.z;

      if (node.pinned) {
        node.velocity.x = 0;
        node.velocity.y = 0;
        node.velocity.z = 0;
        continue;
      }

      node.velocity.x =
        (node.velocity.x + node.force.x * node.inverseMass * deltaSeconds) *
        dampingFactor;
      node.velocity.y =
        (node.velocity.y + node.force.y * node.inverseMass * deltaSeconds) *
        dampingFactor;
      node.velocity.z =
        (node.velocity.z + node.force.z * node.inverseMass * deltaSeconds) *
        dampingFactor;

      const [vx, vy, vz] = clampVelocity(
        node.velocity.x,
        node.velocity.y,
        node.velocity.z,
        config.physics.maximumVelocity,
      );
      node.velocity.x = vx;
      node.velocity.y = vy;
      node.velocity.z = vz;
      node.position.x += vx * deltaSeconds;
      node.position.y += vy * deltaSeconds;
      node.position.z = Math.max(
        -maximumDepth,
        Math.min(maximumDepth, node.position.z + vz * deltaSeconds),
      );
    }
  },
};
