import type { PresetRendererResult } from "../core/contracts";

type GenericGetContext = (
  contextId: string,
  options?: unknown,
) => RenderingContext | null;

interface WebGlResourceTracker {
  cleanupFailedInitialization(): void;
  finalizeSuccessfulInitialization(): void;
  restoreMethods(): void;
}

function replaceProperty(
  target: object,
  property: PropertyKey,
  value: unknown,
): () => void {
  const previous = Object.getOwnPropertyDescriptor(target, property);
  Object.defineProperty(target, property, {
    configurable: true,
    writable: true,
    value,
  });

  return () => {
    if (previous) Object.defineProperty(target, property, previous);
    else Reflect.deleteProperty(target, property);
  };
}

function isWebGlContext(
  context: RenderingContext,
): context is WebGLRenderingContext {
  return (
    "createBuffer" in context &&
    "deleteBuffer" in context &&
    "createProgram" in context &&
    "deleteProgram" in context
  );
}

function trackWebGlResources(
  gl: WebGLRenderingContext,
): WebGlResourceTracker {
  const buffers = new Set<WebGLBuffer>();
  const programs = new Set<WebGLProgram>();
  const shaders = new Set<WebGLShader>();

  const createBuffer = gl.createBuffer.bind(gl);
  const deleteBuffer = gl.deleteBuffer.bind(gl);
  const createProgram = gl.createProgram.bind(gl);
  const deleteProgram = gl.deleteProgram.bind(gl);
  const createShader = gl.createShader.bind(gl);
  const deleteShader = gl.deleteShader.bind(gl);

  const restoreMethods = [
    replaceProperty(gl, "createBuffer", () => {
      const buffer = createBuffer();
      if (!buffer) throw new Error("Failed to create WebGL buffer.");
      buffers.add(buffer);
      return buffer;
    }),
    replaceProperty(gl, "deleteBuffer", (buffer: WebGLBuffer | null) => {
      if (buffer) buffers.delete(buffer);
      deleteBuffer(buffer);
    }),
    replaceProperty(gl, "createProgram", () => {
      const program = createProgram();
      if (program) programs.add(program);
      return program;
    }),
    replaceProperty(gl, "deleteProgram", (program: WebGLProgram | null) => {
      if (program) programs.delete(program);
      deleteProgram(program);
    }),
    replaceProperty(gl, "createShader", (kind: number) => {
      const shader = createShader(kind);
      if (shader) shaders.add(shader);
      return shader;
    }),
    replaceProperty(gl, "deleteShader", (shader: WebGLShader | null) => {
      if (shader) shaders.delete(shader);
      deleteShader(shader);
    }),
  ];

  return {
    cleanupFailedInitialization() {
      for (const buffer of buffers) deleteBuffer(buffer);
      for (const shader of shaders) deleteShader(shader);
      for (const program of programs) deleteProgram(program);
      buffers.clear();
      shaders.clear();
      programs.clear();
    },

    finalizeSuccessfulInitialization() {
      // Linked programs retain their executable after attached shaders are
      // deleted, so shader objects do not need to live for the renderer's life.
      for (const shader of shaders) deleteShader(shader);
      shaders.clear();
    },

    restoreMethods() {
      for (let index = restoreMethods.length - 1; index >= 0; index -= 1) {
        restoreMethods[index]!();
      }
    },
  };
}

export function createRendererWithWebglCleanup(
  canvas: HTMLCanvasElement,
  createRenderer: () => PresetRendererResult,
): PresetRendererResult {
  const getContext = canvas.getContext.bind(canvas) as GenericGetContext;
  const trackerRef: { current: WebGlResourceTracker | null } = {
    current: null,
  };

  const restoreGetContext = replaceProperty(
    canvas,
    "getContext",
    (contextId: string, options?: unknown): RenderingContext | null => {
      const context = getContext(contextId, options);
      if (
        !trackerRef.current &&
        (contextId === "webgl" || contextId === "experimental-webgl") &&
        context &&
        isWebGlContext(context)
      ) {
        trackerRef.current = trackWebGlResources(context);
      }
      return context;
    },
  );

  try {
    const result = createRenderer();
    if (result.canvas === canvas) {
      trackerRef.current?.finalizeSuccessfulInitialization();
    } else {
      trackerRef.current?.cleanupFailedInitialization();
    }
    return result;
  } catch (error) {
    trackerRef.current?.cleanupFailedInitialization();
    throw error;
  } finally {
    trackerRef.current?.restoreMethods();
    restoreGetContext();
  }
}
