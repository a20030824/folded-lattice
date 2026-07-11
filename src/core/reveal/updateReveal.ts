import type { FrameSystem } from "../contracts";
import { clamp, damp, smoothstep, valueNoise2D } from "../math";

/**
 * Structural reveal. Instead of picking random edges, a slow drifting
 * noise field sweeps the membrane; whatever it touches surfaces as one
 * coherent patch and later dissolves back into the dark.
 */
export const revealSystem: FrameSystem = {
  name: "stress-reveal",
  updateFrame(state, config, deltaSeconds) {
    const settings = config.reveal;
    const { nodes, edges, triangles } = state.topology;
    const shortSide = Math.max(
      1,
      Math.min(state.viewport.width, state.viewport.height),
    );
    const noiseScale = settings.patchScale / shortSide;
    const drift = state.time.elapsed * settings.patchDriftSpeed;
    const seedOffset = config.topology.randomSeed * 0.001;

    // Noise > threshold hides, below reveals; smooth band keeps patch rims soft.
    const edgeThreshold = settings.maximumVisibleEdgeRatio;
    const triangleThreshold = settings.maximumVisibleTriangleRatio;

    for (const edge of edges) {
      const a = nodes[edge.nodeA];
      const b = nodes[edge.nodeB];
      if (!a || !b) continue;

      const midX = (a.restPosition.x + b.restPosition.x) * 0.5;
      const midY = (a.restPosition.y + b.restPosition.y) * 0.5;
      const patch = valueNoise2D(
        midX * noiseScale + drift + seedOffset,
        midY * noiseScale - drift * 0.61,
      );
      const patchSignal = smoothstep(edgeThreshold + 0.09, edgeThreshold - 0.09, patch);

      const tensionSignal = clamp(
        (edge.tension - settings.edgeTensionThreshold) * settings.edgeTensionGain,
      );
      const memorySignal = edge.memory * settings.edgeMemoryGain;
      const verticalMotion =
        (Math.abs(a.velocity.z) + Math.abs(b.velocity.z)) * 0.5;
      const edgeMotionGain = settings.edgeMotionGain ?? 0;
      const motionSignal =
        edgeMotionGain > 0
          ? clamp(
              (verticalMotion - (settings.edgeMotionThreshold ?? 0)) *
                edgeMotionGain,
            )
          : 0;
      // The pinned hull would otherwise read as a hard picture frame.
      const boundaryFade = a.pinned && b.pinned ? 0.2 : 1;
      const target =
        clamp(
          settings.edgeBaseVisibility +
            patchSignal * settings.patchTrace +
            tensionSignal +
            memorySignal +
            motionSignal,
        ) * boundaryFade;
      const rate = target > edge.visibility ? settings.revealAttack : settings.revealRelease;
      edge.visibility = damp(edge.visibility, target, rate, deltaSeconds);
      edge.highlight = damp(
        edge.highlight,
        clamp(tensionSignal * (0.4 + patchSignal * 1.4)),
        target > edge.highlight ? settings.revealAttack * 1.4 : settings.revealRelease,
        deltaSeconds,
      );
    }

    for (const triangle of triangles) {
      const patch = valueNoise2D(
        triangle.center.x * noiseScale + drift * 0.83 + seedOffset + 11.3,
        triangle.center.y * noiseScale - drift * 0.52,
      );
      const patchSignal = smoothstep(
        triangleThreshold + 0.11,
        triangleThreshold - 0.11,
        patch,
      );

      const foldSignal = clamp(
        (Math.abs(triangle.foldValue) - settings.triangleFoldThreshold) *
          settings.triangleFoldGain,
      );
      const memorySignal = Math.abs(triangle.memoryBias) * settings.triangleMemoryGain;
      const a = nodes[triangle.nodeA];
      const b = nodes[triangle.nodeB];
      const c = nodes[triangle.nodeC];
      const verticalMotion =
        a && b && c
          ? (Math.abs(a.velocity.z) + Math.abs(b.velocity.z) + Math.abs(c.velocity.z)) / 3
          : 0;
      const triangleMotionGain = settings.triangleMotionGain ?? 0;
      const motionSignal =
        triangleMotionGain > 0
          ? clamp(
              (verticalMotion - (settings.triangleMotionThreshold ?? 0)) *
                triangleMotionGain,
            )
          : 0;
      const target = clamp(
        patchSignal * (0.06 + foldSignal * 0.9) +
          foldSignal * 0.5 +
          memorySignal +
          motionSignal,
      );
      const rate =
        target > triangle.visibility ? settings.revealAttack : settings.revealRelease;
      triangle.visibility = damp(triangle.visibility, target, rate, deltaSeconds);
    }
  },
};
