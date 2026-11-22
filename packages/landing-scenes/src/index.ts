// The three-free half: data, layout and the build-time poster. The three.js scene is `./scenes`.
export { REFUND_REVIEW, nodeDetail, sceneGraphFromIr } from './graph.js'
export type { NodePlace, SceneEdge, SceneGraph, SceneNode, SceneNodeKind } from './graph.js'
export { edgePulse, spanFrame } from './timeline.js'
export type { EdgeFrame, NodeFrame, NodeStatus, RunFrame, Span } from './timeline.js'
export { USE_CASES, useCaseFrame } from './use-cases.js'
export type { UseCase } from './use-cases.js'
export { sceneSupport } from './capability.js'
export type { SceneFallbackReason, SceneSupport } from './capability.js'
export { FACE, KIND_TOKENS, STATUS_TOKENS, clip, statusLine } from './card-face.js'
export { GLYPHS } from './glyphs.js'
export type { GlyphName } from './glyphs.js'
export {
  CARD,
  HERO_CAMERA,
  HERO_YAW,
  canvasSize,
  edgePoints,
  heroCentreZ,
  rootShiftInLocal,
  heroOffsetX,
  nodePosition,
  projector,
  rotateY,
} from './layout.js'
export type { CameraSpec, Vec3 } from './layout.js'
export { graphPosterSvg } from './poster.js'
export type { PosterOptions } from './poster.js'
export { readColor, resolveCssColor } from './color.js'
