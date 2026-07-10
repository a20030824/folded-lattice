import type { SimulationSystem } from "../contracts";

export const geometrySystem: SimulationSystem = {
  name: "geometry",
  update(state, config) {
    const { nodes, edges, triangles } = state.topology;
    const maximumDepth = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height) *
        config.physics.maximumDepthRatio,
    );

    for (const edge of edges) {
      const a = nodes[edge.nodeA]!;
      const b = nodes[edge.nodeB]!;
      edge.currentLength = Math.hypot(
        b.position.x - a.position.x,
        b.position.y - a.position.y,
        b.position.z - a.position.z,
      );
      edge.strain =
        edge.restLength > 1e-6
          ? (edge.currentLength - edge.restLength) / edge.restLength
          : 0;
      edge.tension = Math.abs(edge.strain);
    }

    for (const triangle of triangles) {
      const a = nodes[triangle.nodeA]!;
      const b = nodes[triangle.nodeB]!;
      const c = nodes[triangle.nodeC]!;
      const abx = b.position.x - a.position.x;
      const aby = b.position.y - a.position.y;
      const abz = b.position.z - a.position.z;
      const acx = c.position.x - a.position.x;
      const acy = c.position.y - a.position.y;
      const acz = c.position.z - a.position.z;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const magnitude = Math.max(1e-6, Math.hypot(crossX, crossY, crossZ));

      triangle.center.x = (a.position.x + b.position.x + c.position.x) / 3;
      triangle.center.y = (a.position.y + b.position.y + c.position.y) / 3;
      triangle.center.z = (a.position.z + b.position.z + c.position.z) / 3;
      triangle.currentArea = magnitude * 0.5;
      triangle.normal.x = crossX / magnitude;
      triangle.normal.y = crossY / magnitude;
      triangle.normal.z = crossZ / magnitude;
      triangle.foldValue =
        triangle.center.z / maximumDepth +
        (triangle.normal.x * config.render.lightDirection.x +
          triangle.normal.y * config.render.lightDirection.y) *
          0.45;
    }
  },
};
