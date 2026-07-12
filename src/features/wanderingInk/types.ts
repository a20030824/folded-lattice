/**
 * One sample of the wanderer's body, tail to head. Width factor records
 * how fast the creature moved when this point was laid down - slow
 * travel pools into a wider stroke, like a brush.
 */
export interface CreaturePointState {
  x: number;
  y: number;
  widthFactor: number;
}

/**
 * A single line-creature that roams the sheet. It is the only actor:
 * its path dents the terrain, and the pointer only ever talks to it.
 */
export interface CreatureState {
  points: CreaturePointState[];
  heading: number;
  speed: number;
  distanceSinceSample: number;
  /**
   * Lingering fright, 0..1. Spikes when the pointer gets close and
   * decays over seconds - the creature does not calm down the moment
   * the hand leaves.
   */
  fear: number;
  /**
   * How settled the current rest is, 0..1. Grows while resting; the
   * head pools into a drop of ink and the press deepens with it.
   */
  restPool: number;
  /**
   * Which way the body curls when it rests; picked per rest episode.
   */
  restSign: 1 | -1;
  /**
   * Timer that paces the visible tail retraction while shrinking.
   */
  retractTimer: number;
  /**
   * Seconds left of the current committed rest episode; 0 when awake.
   * Once it lies down it finishes the pose - only a predator close by
   * can interrupt.
   */
  restEpisode: number;
  /**
   * Where this rest began. The ink pools there and stays there - the
   * body curls around the drop, the drop does not follow the head.
   */
  restAnchorX: number;
  restAnchorY: number;
  /**
   * Heading at the moment the rest began. The ink blot soaks backward
   * along this direction, so its eccentricity comes from the body,
   * not from radial noise.
   */
  restHeading: number;
  /**
   * Sleep pressure, grows while awake. The longer since the last rest,
   * the easier the next lull becomes one - rest is rare but findable.
   */
  restPressure: number;
}
