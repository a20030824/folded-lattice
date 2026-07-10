import type { SimulationSystem } from "../contracts";
import { hash01 } from "../math";
import type { FieldState } from "../state";

function synchronizeFields(
  state: Parameters<SimulationSystem["update"]>[0],
  config: Parameters<SimulationSystem["update"]>[1],
): FieldState[] {
  for (let index = state.fields.length - 1; index >= 0; index -= 1) {
    const field = state.fields[index];
    if (field?.kind === "pressure") state.fields.splice(index, 1);
  }

  const shortSide = Math.min(state.viewport.width, state.viewport.height);
  const settings = config.fields.pressure;
  const fields: FieldState[] = [];

  for (let id = 0; id < settings.count; id += 1) {
    const seed = config.topology.randomSeed + 10_007 + id * 7_919;
    const angle = hash01(seed + 1) * Math.PI * 2;
    const speed =
      settings.minimumSpeed +
      (settings.maximumSpeed - settings.minimumSpeed) * hash01(seed + 2);
    const field: FieldState = {
      id,
      kind: "pressure",
      position: {
        x: state.viewport.width * (0.15 + hash01(seed + 3) * 0.7),
        y: state.viewport.height * (0.15 + hash01(seed + 4) * 0.7),
        z: 0,
      },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, z: 0 },
      radius:
        shortSide *
        (settings.minimumRadiusRatio +
          (settings.maximumRadiusRatio - settings.minimumRadiusRatio) * hash01(seed + 5)),
      strength:
        settings.minimumStrength +
        (settings.maximumStrength - settings.minimumStrength) * hash01(seed + 6),
      polarity: id % 3 === 2 ? -1 : 1,
      seed,
      age: hash01(seed + 7) * 20,
      lifetime: Number.POSITIVE_INFINITY,
      active: true,
    };
    state.fields.push(field);
    fields.push(field);
  }

  return fields;
}

export const pressureFieldSystem: SimulationSystem = {
  name: "pressure-fields",
  update(state, config, deltaSeconds) {
    let fields = state.fields.filter((field) => field.kind === "pressure");
    if (fields.length !== config.fields.pressure.count) {
      fields = synchronizeFields(state, config);
    }

    const settings = config.fields.pressure;
    const shortSide = Math.min(state.viewport.width, state.viewport.height);

    for (const field of fields) {
      field.age += deltaSeconds;
      field.radius =
        shortSide *
        (settings.minimumRadiusRatio +
          (settings.maximumRadiusRatio - settings.minimumRadiusRatio) * hash01(field.seed + 5));
      field.strength =
        settings.minimumStrength +
        (settings.maximumStrength - settings.minimumStrength) * hash01(field.seed + 6);

      const wanderAngle = field.age * 0.19 + field.seed * 0.001;
      field.velocity.x +=
        Math.cos(wanderAngle) * settings.wanderStrength * deltaSeconds;
      field.velocity.y +=
        Math.sin(wanderAngle * 0.83) * settings.wanderStrength * deltaSeconds;

      const speed = Math.max(1e-6, Math.hypot(field.velocity.x, field.velocity.y));
      const targetSpeed =
        settings.minimumSpeed +
        (settings.maximumSpeed - settings.minimumSpeed) * hash01(field.seed + 2);
      const speedCorrection = targetSpeed / speed;
      field.velocity.x *= speedCorrection;
      field.velocity.y *= speedCorrection;
      field.position.x += field.velocity.x * deltaSeconds;
      field.position.y += field.velocity.y * deltaSeconds;

      if (field.position.x < 0 || field.position.x > state.viewport.width) {
        field.velocity.x *= -1;
        field.position.x = Math.max(0, Math.min(state.viewport.width, field.position.x));
      }
      if (field.position.y < 0 || field.position.y > state.viewport.height) {
        field.velocity.y *= -1;
        field.position.y = Math.max(0, Math.min(state.viewport.height, field.position.y));
      }

      const radiusSquared = field.radius * field.radius;
      for (const node of state.topology.nodes) {
        if (node.pinned) continue;
        const dx = node.position.x - field.position.x;
        const dy = node.position.y - field.position.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= radiusSquared) continue;
        const falloff = 1 - Math.sqrt(distanceSquared) / field.radius;
        node.force.z += falloff * falloff * field.strength * field.polarity;
      }
    }
  },
};
